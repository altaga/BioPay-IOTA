import {AI_URL_API, AI_URL_API_KEY, DID_URL_API, PAYMENT_URL_API} from '@env';
import {IotaClient} from '@iota/iota-sdk/client';
import {formatUnits, randomBytes, uuidV4} from 'ethers';
import React, {Component, Fragment} from 'react';
import {
  Dimensions,
  Keyboard,
  NativeEventEmitter,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import RNPickerSelect from 'react-native-picker-select';
import GlobalStyles, {mainColor, secondaryColor} from '../../../styles/styles';
import {blockchain, refreshTime} from '../../../utils/constants';
import ContextModule from '../../../utils/contextModule';
import {
  arraySum,
  epsilonRound,
  getAsyncStorageValue,
  getEncryptedStorageValue,
  setAsyncStorageValue,
  setEncryptedStorageValue,
  setTokens,
} from '../../../utils/utils';
import Cam from '../components/cam';
import {Transaction} from '@iota/iota-sdk/transactions';
import QRCodeStyled from 'react-native-qrcode-styled';

const baseTab4State = {
  loading: false,
  take: false,
  keyboardHeight: 0,
  selector: 0,
  qrData: '',
  tokenSelected: setTokens(blockchain.tokens)[0],
  amount: '',
};

export default class Tab4 extends Component {
  constructor(props) {
    super(props);
    this.state = baseTab4State;
    this.client = new IotaClient({url: blockchain.rpc});
    this.EventEmitter = new NativeEventEmitter();
  }

  static contextType = ContextModule;

  async getLastRefreshDID() {
    try {
      const lastRefreshDID = await getAsyncStorageValue('lastRefreshDID');
      if (lastRefreshDID === null) throw 'Set First Date';
      return lastRefreshDID;
    } catch (err) {
      await setAsyncStorageValue({lastRefreshDID: 0});
      return 0;
    }
  }

  async componentDidMount() {
    // Public Key
    const {publicKeyDID} = this.context.value;
    if (publicKeyDID !== '') {
      // Event Emitter
      this.EventEmitter.addListener('refresh', async () => {
        Keyboard.dismiss();
        await this.setStateAsync(baseTab4State);
        await setAsyncStorageValue({lastRefreshDID: Date.now()});
        this.refresh();
      });
      // Get Last Refresh
      const lastRefresh = await this.getLastRefreshDID();
      if (Date.now() - lastRefresh >= refreshTime) {
        console.log('Refreshing...');
        await setAsyncStorageValue({lastRefreshDID: Date.now()});
        this.refresh();
      } else {
        console.log(
          `Next refresh Available: ${Math.round(
            (refreshTime - (Date.now() - lastRefresh)) / 1000,
          )} Seconds`,
        );
      }
    }
  }

  componentWillUnmount() {
    this.EventEmitter.removeAllListeners('refresh');
  }

  async refresh() {
    await this.setStateAsync({refreshing: true});
    await this.getDIDBalance();
    await this.setStateAsync({refreshing: false});
  }

  // Get Balances

  async getDIDBalance() {
    const {publicKeyDID} = this.context.value;
    const {tokens} = blockchain;
    const coins = await this.client.getAllBalances({
      owner: publicKeyDID,
    });
    const balancesDID = tokens.map(token => {
      const coin = coins.find(coin => coin.coinType === token.coinType);
      return coin ? coin.totalBalance : 0;
    });
    setAsyncStorageValue({balancesDID});
    this.context.setValue({balancesDID});
  }

  async faceRegister(image) {
    const myHeaders = new Headers();
    myHeaders.append('X-API-Key', AI_URL_API_KEY);
    myHeaders.append('Content-Type', 'application/json');
    const raw = JSON.stringify({
      address: this.context.value.publicKey,
      image,
    });
    const requestOptions = {
      method: 'POST',
      headers: myHeaders,
      body: raw,
      redirect: 'follow',
    };
    return new Promise(resolve => {
      fetch(`${AI_URL_API}/saveUser`, requestOptions)
        .then(response => response.json())
        .then(result => resolve(result.result))
        .catch(() => resolve(null));
    });
  }

  async didRegister(nonce) {
    const myHeaders = new Headers();
    myHeaders.append('Content-Type', 'application/json');

    const raw = JSON.stringify({
      nonce: nonce,
      address: this.context.value.publicKey,
    });

    const requestOptions = {
      method: 'POST',
      headers: myHeaders,
      body: raw,
      redirect: 'follow',
    };
    return new Promise(resolve => {
      fetch(`${DID_URL_API}`, requestOptions)
        .then(response => response.json())
        .then(result => resolve(result))
        .catch(() => resolve(null));
    });
  }

  createWallet(image) {
    this.setState({
      loading: true,
    });
    setTimeout(async () => {
      const res = await this.faceRegister(image);
      console.log({
        res,
      });
      if (
        res.result === 'Address already exists' ||
        res === null ||
        res.result === 'User already exists'
      ) {
        await this.setStateAsync({
          loading: false,
        });
        return;
      }
      const bytes = randomBytes(16);
      const nonceDID = uuidV4(bytes);
      try {
        const {publicKeyDID, did} = await this.didRegister(nonceDID);
        await setEncryptedStorageValue({
          did,
        });
        await setAsyncStorageValue({
          publicKeyDID,
        });
        this.context.setValue({
          publicKeyDID,
        });
        await this.setStateAsync({
          loading: false,
        });
        this.componentDidMount();
      } catch (err) {
        await this.setStateAsync({
          loading: false,
        });
        return;
      }
    }, 100);
  }

  async createPayment(nonce) {
    const myHeaders = new Headers();
    myHeaders.append('Content-Type', 'application/json');
    const did = await getEncryptedStorageValue('did');
    const raw = JSON.stringify({
      nonce,
      did,
    });
    const requestOptions = {
      method: 'POST',
      headers: myHeaders,
      body: raw,
      redirect: 'follow',
    };
    return new Promise(resolve => {
      fetch(PAYMENT_URL_API, requestOptions)
        .then(response => response.json())
        .then(result => resolve(result.res))
        .catch(() => resolve(null));
    });
  }

  async createQR() {
    this.setState({
      loading: true,
    });
    const bytes = randomBytes(16);
    const noncePayment = uuidV4(bytes);
    const res = await this.createPayment(noncePayment);
    if (res === null || res === 'BAD REQUEST') {
      await this.setStateAsync({
        loading: false,
      });
      return;
    }
    this.setState({
      loading: false,
      qrData: noncePayment,
    });
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
      to: this.context.value.publicKeyDID,
      amount: amount * Math.pow(10, blockchain.decimals),
    });
    this.context.setValue({
      isTransactionActive: true,
      transactionData: {
        // Wallet Selection
        walletSelector: 0,
        // Commands
        command: label,
        tokenSelected: this.state.tokenSelected.index,
        // Transaction
        transaction,
        // With Savings
        withSavings: false,
        transactionSavings: {},
        // Single Display
        // Display
        label,
        to: this.context.value.publicKeyDID,
        amount: this.state.amount,
        tokenSymbol: this.state.tokenSelected.label,
        // Display Savings
        savedAmount: 0,
      },
    });
    await this.setStateAsync({loading: false});
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

  render() {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          this.context.value.publicKeyDID !== '' && (
            <RefreshControl
              progressBackgroundColor={mainColor}
              refreshing={this.state.refreshing}
              onRefresh={async () => {
                await setAsyncStorageValue({
                  lastRefreshDID: Date.now().toString(),
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
            height: '100%',
          },
        ]}>
        {this.context.value.publicKeyDID !== '' ? (
          <Fragment>
            <LinearGradient
              style={{
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                marginTop: 30,
              }}
              colors={['#000000', '#1a1a1a', '#000000']}>
              <Text style={[GlobalStyles.title]}>FaceDID Balance</Text>
              <Text style={[GlobalStyles.balance]}>
                {`$ ${epsilonRound(
                  arraySum(
                    this.context.value.balancesDID
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
                  this.state.selector === 0
                    ? GlobalStyles.buttonSelectorSelectedStyle
                    : GlobalStyles.buttonSelectorStyle,
                ]}
                onPress={async () => {
                  this.setState({selector: 0});
                }}>
                <Text style={[GlobalStyles.buttonText, {fontSize: 18}]}>
                  Coins
                </Text>
              </Pressable>
              <Pressable
                disabled={this.state.loading}
                style={[
                  this.state.selector === 1
                    ? GlobalStyles.buttonSelectorSelectedStyle
                    : GlobalStyles.buttonSelectorStyle,
                ]}
                onPress={async () => {
                  this.setState({selector: 1});
                }}>
                <Text style={[GlobalStyles.buttonText, {fontSize: 18}]}>
                  Add Coins
                </Text>
              </Pressable>
              <Pressable
                disabled={this.state.loading}
                style={[
                  this.state.selector === 2
                    ? GlobalStyles.buttonSelectorSelectedStyle
                    : GlobalStyles.buttonSelectorStyle,
                ]}
                onPress={async () => {
                  this.setState({selector: 2});
                }}>
                <Text style={[GlobalStyles.buttonText, {fontSize: 18}]}>
                  DID Pay
                </Text>
              </Pressable>
            </View>
            {this.state.selector === 0 && (
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
                                this.context.value.balancesDID[i],
                                blockchain.tokens[i].decimals,
                              ),
                            ) === 0
                              ? '0'
                              : parseFloat(
                                  formatUnits(
                                    this.context.value.balancesDID[i],
                                    blockchain.tokens[i].decimals,
                                  ),
                                ) < 0.001
                              ? '<0.01'
                              : epsilonRound(
                                  formatUnits(
                                    this.context.value.balancesDID[i],
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
                              this.context.value.balancesDID[i],
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
            {this.state.selector === 1 && (
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
            )}
            {this.state.selector === 2 && (
              <View
                style={{
                  flex: 1,
                  justifyContent: "space-evenly",
                  alignItems: 'center',
                  width: '90%',
                  height: '100%',
                }}>
                {this.state.qrData === '' ? (
                  <Pressable
                    disabled={this.state.loading}
                    style={[
                      GlobalStyles.buttonStyle,
                      this.state.loading ? {opacity: 0.5} : {},
                    ]}
                    onPress={() => this.createQR()}>
                    <Text style={[GlobalStyles.buttonText]}>
                      {this.state.loading ? 'Creating...' : 'Create QR Payment'}
                    </Text>
                  </Pressable>
                ) : (
                  <Fragment>
                    <Text style={GlobalStyles.formTitleCard}>Payment QR</Text>
                    <QRCodeStyled
                    maxSize={Dimensions.get('screen').width * 0.7}
                    data={this.state.qrData}
                    style={[
                      {
                        backgroundColor: 'white',
                        borderRadius: 10,
                      },
                    ]}
                    errorCorrectionLevel="H"
                    padding={16}
                    //pieceSize={10}
                    pieceBorderRadius={4}
                    isPiecesGlued
                    color={'black'}
                  />
                  </Fragment>
                  
                )}
              </View>
            )}
          </Fragment>
        ) : (
          <View
            style={{
              flex: 1,
              justifyContent: 'space-around',
              alignItems: 'center',
              width: '90%',
            }}>
            <View>
              <Text style={{color: 'white', fontSize: 28}}>FaceDID</Text>
            </View>
            <View
              style={{
                height: Dimensions.get('screen').height * 0.5,
                width: Dimensions.get('screen').width * 0.8,
                marginVertical: 20,
                borderColor: secondaryColor,
                borderWidth: 5,
                borderRadius: 10,
              }}>
              <Cam
                take={this.state.take}
                onImage={image => {
                  this.createWallet(image);
                }}
              />
            </View>
            <Pressable
              disabled={this.state.loading}
              style={[
                GlobalStyles.buttonStyle,
                this.state.loading ? {opacity: 0.5} : {},
              ]}
              onPress={() =>
                this.setState({take: true, loading: true}, () => {
                  this.setState({
                    take: false,
                  });
                })
              }>
              <Text style={[GlobalStyles.buttonText]}>
                {this.state.loading ? 'Creating...' : 'Create Account'}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    );
  }
}
