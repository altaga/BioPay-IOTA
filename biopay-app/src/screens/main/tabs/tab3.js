import { CREATE_CARD_API } from '@env';
import { IotaClient } from '@iota/iota-sdk/client';
import { Transaction } from '@iota/iota-sdk/transactions';
import { formatUnits, randomBytes, uuidV4 } from 'ethers';
import React, { Component, Fragment } from 'react';
import {
  Keyboard,
  NativeEventEmitter,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import CreditCard from 'react-native-credit-card';
import LinearGradient from 'react-native-linear-gradient';
import RNPickerSelect from 'react-native-picker-select';
import Crypto from 'react-native-quick-crypto';
import GlobalStyles, { mainColor } from '../../../styles/styles';
import {
  blockchain,
  CloudPublicKeyEncryption,
  refreshTime,
} from '../../../utils/constants';
import ContextModule from '../../../utils/contextModule';
import {
  arraySum,
  epsilonRound,
  getAsyncStorageValue,
  randomNumber,
  setAsyncStorageValue,
  setTokens
} from '../../../utils/utils';
import ReadCard from '../components/readCard';

const generator = require('creditcard-generator');

const baseTab3State = {
  // Transaction settings
  amount: '',
  tokenSelected: setTokens(blockchain.tokens)[0], // ""
  // Card
  cvc: randomNumber(111, 999),
  expiry: '1228',
  name: 'BioCard',
  number: generator.GenCC('VISA'),
  imageFront: require('../../../assets/cardAssets/card-front.png'),
  imageBack: require('../../../assets/cardAssets/card-back.png'),
  // Utils
  stage: 0,
  selector: false,
  nfcSupported: true,
  loading: false,
  keyboardHeight: 0,
  cardInfo: {
    card: '',
    exp: '',
  },
};

export default class Tab3 extends Component {
  constructor(props) {
    super(props);
    this.state = baseTab3State;
    this.client = new IotaClient({url: blockchain.rpc});
    this.EventEmitter = new NativeEventEmitter();
  }

  static contextType = ContextModule;

  async componentDidMount() {
    const publicKeyCard = this.context.value.publicKeyCard;
    if (publicKeyCard !== '') {
      this.EventEmitter.addListener('refresh', async () => {
        Keyboard.dismiss();
        await this.setStateAsync(baseTab3State);
        await setAsyncStorageValue({lastRefreshCard: Date.now()});
        this.refresh();
      });
      const refreshCheck = Date.now();
      const lastRefresh = await this.getLastRefreshCard();
      if (refreshCheck - lastRefresh >= refreshTime) {
        console.log('Refreshing...');
        await setAsyncStorageValue({lastRefreshCard: Date.now()});
        await this.refresh();
      } else {
        console.log(
          `Next refresh Available: ${Math.round(
            (refreshTime - (refreshCheck - lastRefresh)) / 1000,
          )} Seconds`,
        );
      }
    }
  }

  componentWillUnmount() {
    this.EventEmitter.removeAllListeners('refresh');
  }

  async createTx(transaction) {
    const tx = new Transaction();
    let coinToSplit;
    if (transaction.coin === blockchain.tokens[0].coinType) {
      coinToSplit = tx.gas;
    } else {
      const coins = await this.client.getAllCoins({
        owner: this.context.value.publicKey,
      });
      const [primaryCoin, ...mergeCoins] = coins.data.filter(
        coin => coin.coinType === transaction.coin,
      );
      const primaryCoinInput = tx.object(primaryCoin.coinObjectId);
      if (mergeCoins.length) {
        tx.mergeCoins(
          primaryCoinInput,
          mergeCoins.map(coin => tx.object(coin.coinObjectId)),
        );
      }
      coinToSplit = primaryCoinInput;
    }
    const [coin] = tx.splitCoins(coinToSplit, [parseInt(transaction.amount)]); // Split coins for the transaction
    tx.transferObjects([coin], transaction.to); // Set the recipient address
    return tx;
  }

  async transfer() {
    const {tokenSelected} = this.state;
    const label = tokenSelected.index === 0 ? 'transfer' : 'coinTransfer';
    const amount = epsilonRound(
      parseFloat(this.state.amount),
      blockchain.tokens[tokenSelected.index].decimals,
    );
    const transaction = await this.createTx({
      coin: tokenSelected.coinType,
      to: this.context.value.publicKeyCard,
      amount: amount * Math.pow(10, blockchain.decimals),
    });
    this.context.setValue({
      isTransactionActive: true,
      transactionData: {
        // Wallet Selection
        walletSelector: 0,
        // Commands
        command: label,
        tokenSelected: tokenSelected.index,
        // Transaction
        transaction,
        // With Savings
        withSavings: false,
        transactionSavings: {},
        // Single Display
        // Display
        label,
        to: this.context.value.publicKeyCard,
        amount: this.state.amount,
        tokenSymbol: tokenSelected.label,
        // Display Savings
        savedAmount: 0,
      },
    });
    await this.setStateAsync({loading: false});
  }

  createWallet() {
    this.setState({
      loading: true,
    });
    const myHeaders = new Headers();
    myHeaders.append('Content-Type', 'application/json');
    const bytes = randomBytes(16);
    const nonce = uuidV4(bytes);
    const raw = JSON.stringify({
      card: `${this.state.cardInfo.card}${this.state.cardInfo.exp}`,
      nonce,
      address: this.context.value.publicKey,
    });
    const requestOptions = {
      method: 'POST',
      headers: myHeaders,
      body: raw,
      redirect: 'follow',
    };
    fetch(`${CREATE_CARD_API}`, requestOptions)
      .then(response => response.json())
      .then(async result => {
        const {publicKeyCard} = result;
        await setAsyncStorageValue({
          publicKeyCard,
        });
        this.context.setValue({
          publicKeyCard,
        });
        await this.setStateAsync({
          loading: false,
          stage: 0,
        });
        this.componentDidMount();
      })
      .catch(error => {
        console.log('error', error);
        this.setState({
          loading: false,
        });
      });
  }

  async getCardBalance() {
    const {publicKeyCard} = this.context.value;
    const {tokens} = blockchain;
    const coins = await this.client.getAllBalances({
      owner: publicKeyCard,
    });
    const balancesCard = tokens.map(token => {
      const coin = coins.find(coin => coin.coinType === token.coinType);
      return coin ? coin.totalBalance : 0;
    });
    setAsyncStorageValue({balancesCard});
    this.context.setValue({balancesCard});
  }

  // Utils
  async setStateAsync(value) {
    return new Promise(resolve => {
      this.setState(
        {
          ...value,
        },
        () => resolve(),
      );
    });
  }

  async refresh() {
    await this.setStateAsync({refreshing: true});
    await this.getCardBalance();
    await this.setStateAsync({refreshing: false});
  }

  async getLastRefreshCard() {
    try {
      const lastRefreshCard = await getAsyncStorageValue('lastRefreshCard');
      if (lastRefreshCard === null) throw 'Set First Date';
      return lastRefreshCard;
    } catch (err) {
      await setAsyncStorageValue({lastRefreshCard: 0});
      return 0;
    }
  }

  encryptData(data) {
    const encrypted = Crypto.publicEncrypt(
      {
        key: CloudPublicKeyEncryption,
      },
      Buffer.from(data, 'utf8'),
    );
    return encrypted.toString('base64');
  }

  render() {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          this.context.value.publicKeyCard !== '' && (
            <RefreshControl
              progressBackgroundColor={mainColor}
              refreshing={this.state.refreshing}
              onRefresh={async () => {
                await setAsyncStorageValue({
                  lastRefreshCard: Date.now().toString(),
                });
                await this.refresh();
              }}
            />
          )
        }
        style={GlobalStyles.tab3Container}
        contentContainerStyle={[
          GlobalStyles.tab3ScrollContainer,
          {
            height: this.context.value.publicKeyCard !== '' ? 'auto' : '100%',
          },
        ]}>
        {this.context.value.publicKeyCard !== '' ? (
          <Fragment>
            <View style={{height: 180, marginTop: 30}}>
              <CreditCard
                type={this.state.type}
                imageFront={this.state.imageFront}
                imageBack={this.state.imageBack}
                shiny={false}
                bar={false}
                number={this.state.number}
                name={this.state.name}
                expiry={this.state.expiry}
                cvc={this.state.cvc}
              />
            </View>
            <LinearGradient
              style={{
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                marginTop: 30,
              }}
              colors={['#000000', '#1a1a1a', '#000000']}>
              <Text style={[GlobalStyles.title]}>Card Balance</Text>
              <Text style={[GlobalStyles.balance]}>
                {`$ ${epsilonRound(
                  arraySum(
                    this.context.value.balancesCard
                      .map(
                        (balance, i) =>
                          formatUnits(balance, blockchain.tokens[i].decimals) *
                          this.context.value.usdConversion[i],
                      )
                      .flat(),
                  ),
                  2,
                )} USD`}
              </Text>
            </LinearGradient>
            <View
              style={{
                flexDirection: 'row',
                width: '100%',
                justifyContent: 'space-evenly',
                alignItems: 'center',
                marginTop: 30,
              }}>
              <Pressable
                disabled={this.state.loading}
                style={[
                  this.state.selector
                    ? GlobalStyles.buttonSelectorStyle
                    : GlobalStyles.buttonSelectorSelectedStyle,
                ]}
                onPress={async () => {
                  this.setState({selector: false});
                }}>
                <Text style={[GlobalStyles.buttonText, {fontSize: 18}]}>
                  Tokens
                </Text>
              </Pressable>
              <Pressable
                disabled={this.state.loading}
                style={[
                  !this.state.selector
                    ? GlobalStyles.buttonSelectorStyle
                    : GlobalStyles.buttonSelectorSelectedStyle,
                ]}
                onPress={async () => {
                  this.setState({selector: true});
                }}>
                <Text style={[GlobalStyles.buttonText, {fontSize: 18}]}>
                  Add Balance
                </Text>
              </Pressable>
            </View>
            {this.state.selector ? (
              <View
                style={{
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: '90%',
                  marginTop: 30,
                }}>
                <Text style={GlobalStyles.formTitleCard}>Amount</Text>
                <TextInput
                  style={[GlobalStyles.input, {width: '100%'}]}
                  keyboardType="decimal-pad"
                  value={this.state.amount}
                  onChangeText={value => this.setState({amount: value})}
                />
                <Text style={GlobalStyles.formTitleCard}>Select Token</Text>
                <RNPickerSelect
                  style={{
                    inputAndroidContainer: {
                      textAlign: 'center',
                    },
                    inputAndroid: {
                      textAlign: 'center',
                      color: 'gray',
                    },
                    viewContainer: {
                      ...GlobalStyles.input,
                      width: '100%',
                    },
                  }}
                  value={this.state.tokenSelected.value}
                  items={setTokens(blockchain.tokens)}
                  onValueChange={token => {
                    this.setState({
                      tokenSelected: setTokens(blockchain.tokens)[token],
                    });
                  }}
                />
                <View
                  style={{
                    width: '100%',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                  <Pressable
                    disabled={this.state.loading}
                    style={[
                      GlobalStyles.buttonStyle,
                      {
                        width: '100%',
                        padding: 10,
                        marginVertical: 25,
                      },
                      this.state.loading ? {opacity: 0.5} : {},
                    ]}
                    onPress={async () => {
                      await this.setStateAsync({loading: true});
                      await this.transfer();
                      await this.setStateAsync({
                        loading: false,
                      });
                    }}>
                    <Text style={[GlobalStyles.buttonText]}>
                      {this.state.loading ? 'Adding...' : 'Add'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{marginTop: 30}}>
                {blockchain.tokens.map((token, i) => (
                  <View
                    key={blockchain.tokens.length + i}
                    style={GlobalStyles.network}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-around',
                      }}>
                      <View style={GlobalStyles.networkMarginIcon}>
                        <View>{token.icon}</View>
                      </View>
                      <View style={{justifyContent: 'center'}}>
                        <Text style={GlobalStyles.networkTokenName}>
                          {token.name}
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                          }}>
                          <Text style={GlobalStyles.networkTokenData}>
                            {parseFloat(
                              formatUnits(
                                this.context.value.balancesCard[i],
                                blockchain.tokens[i].decimals,
                              ),
                            ) === 0
                              ? '0'
                              : parseFloat(
                                  formatUnits(
                                    this.context.value.balancesCard[i],
                                    blockchain.tokens[i].decimals,
                                  ),
                                ) < 0.001
                              ? '<0.01'
                              : epsilonRound(
                                  formatUnits(
                                    this.context.value.balancesCard[i],
                                    blockchain.tokens[i].decimals,
                                  ),
                                  2,
                                )}{' '}
                            {token.symbol}
                          </Text>
                          <Text style={GlobalStyles.networkTokenData}>
                            {`  -  ($${epsilonRound(
                              this.context.value.usdConversion[i],
                              4,
                            )} USD)`}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={{marginHorizontal: 20}}>
                      <Text style={{color: 'white'}}>
                        $
                        {epsilonRound(
                          parseFloat(
                            formatUnits(
                              this.context.value.balancesCard[i],
                              blockchain.tokens[i].decimals,
                            ),
                          ) * this.context.value.usdConversion[i],
                          2,
                        )}{' '}
                        USD
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Fragment>
        ) : (
          <Fragment>
            {
              // Stage 0
              this.state.stage === 0 && (
                <View
                  style={{
                    justifyContent: 'center',
                    alignItems: 'center',
                    width: '90%',
                    height: '100%',
                  }}>
                  <Text
                    style={[
                      GlobalStyles.exoTitle,
                      {
                        textAlign: 'center',
                        fontSize: 24,
                        paddingBottom: 20,
                      },
                    ]}>
                    Create Card Account
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'center',
                      width: '100%',
                    }}>
                    <Pressable
                      disabled={this.state.loading}
                      style={[
                        GlobalStyles.buttonStyle,
                        this.state.loading ? {opacity: 0.5} : {},
                      ]}
                      onPress={() => this.setState({stage: 1})}>
                      <Text style={[GlobalStyles.buttonText]}>
                        {this.state.loading ? 'Creating...' : 'Create Account'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )
            }
            {
              // Stage 1
              this.state.stage === 1 && (
                <React.Fragment>
                  <View
                    style={{
                      justifyContent: 'space-around',
                      alignItems: 'center',
                      height: '100%',
                    }}>
                    <Text style={GlobalStyles.title}>
                      {' '}
                      Merge Physical Card to Card Account
                    </Text>
                    <ReadCard
                      cardInfo={async cardInfo => {
                        if (cardInfo) {
                          console.log('Card Info: ', cardInfo);
                          await this.setStateAsync({cardInfo});
                          this.createWallet();
                        }
                      }}
                    />
                  </View>
                </React.Fragment>
              )
            }
          </Fragment>
        )}
      </ScrollView>
    );
  }
}
