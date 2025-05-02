//import {SOLANA_RPC} from '@env';
import {IotaClient} from '@iota/iota-sdk/client';
import React, {Component} from 'react';
import {
  Dimensions,
  Keyboard,
  NativeEventEmitter,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import IconIonIcons from 'react-native-vector-icons/Ionicons';
import Header from '../../components/header';
import GlobalStyles, {secondaryColor} from '../../styles/styles';
import {blockchain} from '../../utils/constants';
import ContextModule from '../../utils/contextModule';
import {
  balancedSaving,
  epsilonRound,
  percentageSaving,
  setTokens,
} from '../../utils/utils';
import Cam from './components/cam';
import KeyboardAwareScrollViewComponent from './components/keyboardAvoid';
import {Transaction} from '@iota/iota-sdk/transactions';

const SendWalletBaseState = {
  // Transaction settings
  toAddress: '', // ""
  amount: '', //
  tokenSelected: setTokens(blockchain.tokens)[0], // ""
  // Status
  stage: 0,
  check: 'Check',
  errorText: '',
  loading: false,
};

class SendWallet extends Component {
  constructor(props) {
    super(props);
    this.state = SendWalletBaseState;
    this.client = new IotaClient({url: blockchain.rpc});
    this.controller = new AbortController();
    this.EventEmitter = new NativeEventEmitter();
  }

  static contextType = ContextModule;

  async componentDidMount() {
    this.props.navigation.addListener('focus', async () => {
      console.log(this.props.route.name);
      this.EventEmitter.addListener('refresh', async () => {
        this.setState(SendWalletBaseState);
        Keyboard.dismiss();
      });
    });
    this.props.navigation.addListener('blur', async () => {
      this.setState(SendWalletBaseState);
      this.EventEmitter.removeAllListeners('refresh');
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
    const {publicKeySavings} = this.context.value;
    const transaction = await this.createTx({
      coin: tokenSelected.coinType,
      to: this.state.toAddress,
      amount: amount * Math.pow(10, blockchain.decimals),
    });
    // With Savings
    let savings = 0;
    let transactionSavings = {};
    if (this.context.value.savingsFlag) {
      const valueOnIOTA =
        label === 'transfer'
          ? amount
          : (amount *
              this.context.value.usdConversion[
                this.state.tokenSelected.index
              ]) /
            this.context.value.usdConversion[0];
      savings =
        this.context.value.protocolSelected === 1
          ? balancedSaving(valueOnIOTA, this.context.value.usdConversion[0])
          : percentageSaving(valueOnIOTA, this.context.value.percentage);
      transactionSavings = await this.createTx({
        coin: blockchain.tokens[0].coinType,
        to: publicKeySavings,
        amount:
          epsilonRound(savings, blockchain.decimals) *
          Math.pow(10, blockchain.decimals),
      });
    }
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
        withSavings: this.context.value.savingsFlag,
        transactionSavings,
        // Single Display
        // Display
        label,
        to: this.state.toAddress,
        amount: this.state.amount,
        tokenSymbol: this.state.tokenSelected.label,
        // Display Savings
        savedAmount: savings,
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
      <SafeAreaView style={GlobalStyles.container}>
        <Header />
        {this.state.stage === 0 && (
          <KeyboardAwareScrollViewComponent>
            <SafeAreaView style={GlobalStyles.mainFull}>
              <ScrollView
                contentContainerStyle={{
                  height: '96%',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                <View
                  style={{
                    alignItems: 'center',
                  }}>
                  <View style={{marginTop: 20}} />
                  <Text style={GlobalStyles.formTitleCard}>Address</Text>
                  <View
                    style={{
                      width: Dimensions.get('screen').width,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                    <View style={{width: '90%'}}>
                      <TextInput
                        multiline
                        numberOfLines={1}
                        style={[
                          GlobalStyles.input,
                          {fontSize: 18, height: 100, paddingHorizontal: 18},
                        ]}
                        keyboardType="default"
                        value={this.state.toAddress}
                        onChangeText={value => {
                          this.setState({toAddress: value});
                        }}
                      />
                    </View>
                    <Pressable
                      onPress={() => {
                        this.setStateAsync({
                          stage: 10,
                        });
                      }}
                      style={{width: '10%'}}>
                      <IconIonIcons name="qr-code" size={30} color={'white'} />
                    </Pressable>
                  </View>
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
                        width: Dimensions.get('screen').width * 0.9,
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
                  <Text style={GlobalStyles.formTitleCard}>Amount</Text>
                  <View
                    style={{
                      width: Dimensions.get('screen').width,
                      flexDirection: 'row',
                      justifyContent: 'space-around',
                      alignItems: 'center',
                    }}>
                    <View style={{width: '100%'}}>
                      <TextInput
                        style={[GlobalStyles.input]}
                        keyboardType="decimal-pad"
                        value={this.state.amount}
                        onChangeText={amount => {
                          this.setState({amount});
                        }}
                      />
                    </View>
                  </View>
                </View>
                <Pressable
                  //disabled={this.state.loading}
                  style={[
                    GlobalStyles.buttonStyle,
                    this.state.loading ? {opacity: 0.5} : {},
                  ]}
                  onPress={async () => {
                    console.log('Transfer');
                    await this.setStateAsync({loading: true});
                    await this.transfer();
                    await this.setStateAsync({loading: false});
                  }}>
                  <Text style={[GlobalStyles.buttonText]}>
                    {this.state.check}
                  </Text>
                </Pressable>
              </ScrollView>
            </SafeAreaView>
          </KeyboardAwareScrollViewComponent>
        )}
        {
          // Scan QR
        }
        {this.state.stage === 10 && (
          <View style={[GlobalStyles.main, {justifyContent: 'space-evenly'}]}>
            <View>
              <Text style={{color: 'white', fontSize: 28}}>Scan QR</Text>
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
                callbackAddress={e => {
                  console.log(e);
                  this.setState({
                    toAddress: e,
                    stage: 0,
                  });
                }}
              />
            </View>
            <Pressable
              style={[GlobalStyles.buttonCancelStyle]}
              onPress={async () => {
                this.setState({
                  stage: 0,
                });
              }}>
              <Text style={GlobalStyles.buttonCancelText}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    );
  }
}

export default SendWallet;
