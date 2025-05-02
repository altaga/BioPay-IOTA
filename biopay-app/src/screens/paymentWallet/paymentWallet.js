import {
  FETCH_ADDRESS_URL_API,
  COMPLETE_PAYMENT_URL_API,
  AI_URL_API,
  AI_URL_API_KEY,
} from '@env';
import {IotaClient} from '@iota/iota-sdk/client';
import React, {Component, Fragment} from 'react';
import {
  Dimensions,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import RNPrint from 'react-native-print';
import QRCode from 'react-native-qrcode-svg';
import VirtualKeyboard from 'react-native-virtual-keyboard';
import checkMark from '../../assets/checkMark.png';
import {logo} from '../../assets/logo';
import Header from '../../components/header';
import GlobalStyles, {
  mainColor,
  secondaryColor,
  tertiaryColor,
} from '../../styles/styles';
import {blockchain} from '../../utils/constants';
import ContextModule from '../../utils/contextModule';
import {deleteLeadingZeros, formatInputText} from '../../utils/utils';
import ReadCard from './components/readCard';
import CamQR from './components/camQR';
import Cam from './components/cam';

const BaseStatePaymentWallet = {
  // Base
  balances: blockchain.tokens.map(() => 0),
  activeTokens: blockchain.tokens.map(() => false),
  stage: 0, // 0
  amount: '0.00', // "0.00"
  kindPayment: 0, // 0
  // card
  publicKeyCard: '',
  // did
  nonce: '',
  did: '',
  publicKeyDID: '',
  // Extra
  cardInfo: null,
  explorerURL: '',
  transactionDisplay: {
    amount: '0.00',
    name: blockchain.tokens[0].symbol,
    tokenAddress: blockchain.tokens[0].address,
    icon: blockchain.tokens[0].icon,
  },
  // QR print
  saveData: '',
  // Utils
  take: false,
  loading: false,
};

const sortByPriority = (array, key) => {
  return array.sort((a, b) => {
    const getPriority = value => {
      if (value.includes('USDC')) return 2; // Highest priority
      if (value.includes('EURC')) return 1; // Second priority
      return 0; // No priority
    };
    const priorityA = getPriority(a[key]);
    const priorityB = getPriority(b[key]);
    return priorityB - priorityA; // Sort descending by priority
  });
};

class PaymentWallet extends Component {
  constructor(props) {
    super(props);
    this.state = BaseStatePaymentWallet;
    this.client = new IotaClient({url: blockchain.rpc});
    this.controller = new AbortController();
    this.svg = null;
  }

  static contextType = ContextModule;

  async getDataURL() {
    return new Promise(async (resolve, reject) => {
      this.svg.toDataURL(async data => {
        this.setState(
          {
            saveData: data,
          },
          () => resolve('ok'),
        );
      });
    });
  }

  async print() {
    await this.getDataURL();
    const results = await RNHTMLtoPDF.convert({
      html: `
        <div style="text-align: center;">
          <img src='${logo}' width="400px"></img>
          <h1 style="font-size: 3rem;">--------- Original Reciept ---------</h1>
          <h1 style="font-size: 3rem;">Date: ${new Date().toLocaleDateString()}</h1>
          <h1 style="font-size: 3rem;">Type: ${
            this.state.kindPayment === 0
              ? 'Card'
              : this.state.kindPayment === 1
              ? 'DID'
              : 'FaceDID'
          }</h1>
          <h1 style="font-size: 3rem;">------------------ • ------------------</h1>
          <h1 style="font-size: 3rem;">Transaction</h1>
          <h1 style="font-size: 3rem;">Amount: ${deleteLeadingZeros(
            formatInputText(this.state.transactionDisplay.amount),
          )} ${this.state.transactionDisplay.name}</h1>
          <h1 style="font-size: 3rem;">------------------ • ------------------</h1>
          <img style="width:70%" src='${
            'data:image/png;base64,' + this.state.saveData
          }'></img>
      </div>
      `,
      fileName: 'print',
      base64: true,
    });
    await RNPrint.print({filePath: results.filePath});
  }

  componentDidMount() {
    this.props.navigation.addListener('focus', async () => {
      this.setState(BaseStatePaymentWallet);
    });
  }
  payFromAnySource(token) {
    const myHeaders = new Headers();
    myHeaders.append('Content-Type', 'application/json');
    const object =
      this.state.kindPayment === 0
        ? {
            card: `${this.state.cardInfo.card}${this.state.cardInfo.exp}`,
          }
        : {did: this.state.did};
    const raw = JSON.stringify({
      ...object,
      amount: (
        parseFloat(this.state.amount) /
        this.context.value.usdConversion[token.index]
      ).toString(),
      to: this.context.value.publicKey,
      coin: token.coinType,
    });

    const requestOptions = {
      method: 'POST',
      headers: myHeaders,
      body: raw,
      redirect: 'follow',
    };
    fetch(COMPLETE_PAYMENT_URL_API, requestOptions)
      .then(response => response.json())
      .then(async result => {
        const {digest} = result;
        await this.setStateAsync({
          loading: false,
          explorerURL: `${blockchain.blockExplorer}/tx/${digest}`,
        });
      })
      .catch(error => console.error(error));
  }

  async getAddressFromCard() {
    return new Promise((resolve, reject) => {
      const myHeaders = new Headers();
      myHeaders.append('Content-Type', 'application/json');

      const raw = JSON.stringify({
        card: `${this.state.cardInfo.card}${this.state.cardInfo.exp}`,
      });

      const requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: raw,
        redirect: 'follow',
      };

      fetch(FETCH_ADDRESS_URL_API, requestOptions)
        .then(response => response.json())
        .then(result => resolve(result))
        .catch(error => console.error(error));
    });
  }

  async getAddressFromNonce(nonce) {
    return new Promise((resolve, reject) => {
      const myHeaders = new Headers();
      myHeaders.append('Content-Type', 'application/json');

      const raw = JSON.stringify({
        nonce,
      });

      const requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: raw,
        redirect: 'follow',
      };

      fetch(FETCH_ADDRESS_URL_API, requestOptions)
        .then(response => response.json())
        .then(result => resolve(result))
        .catch(error => console.error(error));
    });
  }

  async getAddressFromFaceDID(address) {
    return new Promise((resolve, reject) => {
      const myHeaders = new Headers();
      myHeaders.append('Content-Type', 'application/json');

      const raw = JSON.stringify({
        address,
      });

      const requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: raw,
        redirect: 'follow',
      };

      fetch(FETCH_ADDRESS_URL_API, requestOptions)
        .then(response => response.json())
        .then(result => resolve(result))
        .catch(error => console.error(error));
    });
  }

  async getBalances(publicKey) {
    const {tokens} = blockchain;
    const coins = await this.client.getAllBalances({
      owner: publicKey,
    });
    const balances = tokens.map(token => {
      const coin = coins.find(coin => coin.coinType === token.coinType);
      return coin ? coin.totalBalance : 0;
    });
    const activeTokens = balances.map(
      (balance, i) =>
        balance >
        parseFloat(deleteLeadingZeros(formatInputText(this.state.amount))) /
          this.context.value.usdConversion[i],
    );
    await this.setStateAsync({balances, activeTokens, stage: 2, loading: false});
  }

  async findAddress(image) {
    const myHeaders = new Headers();
    myHeaders.append('X-API-Key', AI_URL_API_KEY);
    myHeaders.append('Content-Type', 'application/json');
    const raw = JSON.stringify({
      image,
    });
    const requestOptions = {
      method: 'POST',
      headers: myHeaders,
      body: raw,
      redirect: 'follow',
    };
    return new Promise(resolve => {
      fetch(`${AI_URL_API}/findUser`, requestOptions)
        .then(response => response.json())
        .then(result => resolve(result.result))
        .catch(() => resolve(null));
    });
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
      <Fragment>
        <SafeAreaView style={[GlobalStyles.container]}>
          <Header />
          <View style={[GlobalStyles.mainFull]}>
            {this.state.stage === 0 && (
              <View
                style={{
                  height: '100%',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                <Text style={GlobalStyles.title}>Enter Amount (USD)</Text>
                <Text style={{fontSize: 36, color: 'white'}}>
                  {deleteLeadingZeros(formatInputText(this.state.amount))}
                </Text>
                <VirtualKeyboard
                  style={{
                    width: '80vw',
                    fontSize: 40,
                    textAlign: 'center',
                    marginTop: -10,
                  }}
                  cellStyle={{
                    width: 50,
                    height: 50,
                    borderWidth: 1,
                    borderColor: '#77777777',
                    borderRadius: 5,
                    margin: 1,
                  }}
                  color="white"
                  pressMode="string"
                  onPress={amount => this.setState({amount})}
                  decimal
                />
                <View
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    width: Dimensions.get('window').width,
                  }}>
                  <Pressable
                    style={GlobalStyles.buttonStyle}
                    onPress={() => this.setState({stage: 1, kindPayment: 0})}>
                    <Text style={GlobalStyles.buttonText}>Pay with Card</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      GlobalStyles.buttonStyle,
                      {
                        backgroundColor: secondaryColor,
                        borderColor: secondaryColor,
                      },
                    ]}
                    onPress={() => this.setState({stage: 1, kindPayment: 1})}>
                    <Text style={GlobalStyles.buttonText}>Pay with DID</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      GlobalStyles.buttonStyle,
                      {
                        backgroundColor: tertiaryColor,
                        borderColor: tertiaryColor,
                      },
                    ]}
                    onPress={() => this.setState({stage: 1, kindPayment: 2})}>
                    <Text style={GlobalStyles.buttonText}>
                      Pay with FaceDID
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
            {this.state.stage === 1 && this.state.kindPayment === 0 && (
              <View
                style={{
                  height: '100%',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 40,
                }}>
                <View style={{alignItems: 'center'}}>
                  <Text style={GlobalStyles.title}>Amount (USD)</Text>
                  <Text style={{fontSize: 36, color: 'white'}}>
                    $ {deleteLeadingZeros(formatInputText(this.state.amount))}
                  </Text>
                </View>
                <ReadCard
                  cardInfo={async cardInfo => {
                    if (cardInfo) {
                      await this.setStateAsync({cardInfo});
                      try {
                        const {publicKey: publicKeyCard} =
                          await this.getAddressFromCard(); //
                        await this.setStateAsync({publicKeyCard});
                        await this.getBalances(publicKeyCard);
                      } catch (error) {
                        console.log(error);
                        this.setState(BaseStatePaymentWallet);
                      }
                    }
                  }}
                />
                <View
                  key={
                    'This element its only to align the NFC reader in center'
                  }
                />
              </View>
            )}
            {this.state.stage === 1 && this.state.kindPayment === 1 && (
              <View
                style={{
                  height: '100%',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 40,
                }}>
                <View style={{alignItems: 'center'}}>
                  <Text style={GlobalStyles.title}>Amount (USD)</Text>
                  <Text style={{fontSize: 36, color: 'white'}}>
                    $ {deleteLeadingZeros(formatInputText(this.state.amount))}
                  </Text>
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
                  <CamQR
                    callbackAddress={async nonce => {
                      try {
                        const res = await this.getAddressFromNonce(nonce);
                        const {publicKey: publicKeyDID, did} = res;
                        await this.setStateAsync({publicKeyDID, did});
                        await this.getBalances(publicKeyDID);
                      } catch (error) {
                        console.log(error);
                        this.setState(BaseStatePaymentWallet);
                      }
                    }}
                  />
                </View>
                <View
                  key={
                    'This element its only to align the NFC reader in center'
                  }
                />
              </View>
            )}
            {this.state.stage === 1 && this.state.kindPayment === 2 && (
              <View
                style={{
                  height: '100%',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                <View style={{alignItems: 'center'}}>
                  <Text style={GlobalStyles.title}>Amount (USD)</Text>
                  <Text style={{fontSize: 36, color: 'white'}}>
                    $ {deleteLeadingZeros(formatInputText(this.state.amount))}
                  </Text>
                </View>
                <View>
                  <Text style={{color: 'white', fontSize: 28}}>FaceDID</Text>
                </View>
                <View
                  style={{
                    height: Dimensions.get('screen').height * 0.4,
                    width: Dimensions.get('screen').width * 0.8,
                    marginVertical: 20,
                    borderColor: secondaryColor,
                    borderWidth: 5,
                    borderRadius: 10,
                  }}>
                  <Cam
                    take={this.state.take}
                    onImage={async image => {
                      try {
                        const publicKey = await this.findAddress(image);
                        console.log(publicKey);
                        const res = await this.getAddressFromFaceDID(publicKey);
                        console.log(res);
                        const {publicKey: publicKeyDID, did} = res;
                        console.log(publicKeyDID, did);
                        await this.setStateAsync({publicKeyDID, did});
                        await this.getBalances(publicKeyDID);
                      } catch (error) {
                        console.log(error);
                        this.setState(BaseStatePaymentWallet);
                      }
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
                    {this.state.loading ? 'Processing...' : 'Take Picture'}
                  </Text>
                </Pressable>
              </View>
            )}
            {this.state.stage === 2 && (
              <React.Fragment>
                <Text style={[GlobalStyles.titlePaymentToken]}>
                  Select Payment Token
                </Text>
                <ScrollView>
                  {blockchain.tokens.map((token, i) =>
                    this.state.activeTokens[i] ? (
                      <View
                        key={`${token.name}`}
                        style={{
                          marginBottom: 20,
                        }}>
                        <Pressable
                          disabled={this.state.loading}
                          style={[
                            GlobalStyles.buttonStyle,
                            this.state.loading ? {opacity: 0.5} : {},
                            (token.symbol === 'USDC' ||
                              token.symbol === 'EURC') && {
                              backgroundColor: '#2775ca',
                              borderColor: '#2775ca',
                            },
                          ]}
                          onPress={async () => {
                            try {
                              await this.setStateAsync({
                                transactionDisplay: {
                                  amount: (
                                    this.state.amount /
                                    this.context.value.usdConversion[i]
                                  ).toFixed(6),
                                  name: token.symbol,
                                  icon: token.icon,
                                },
                                stage: 3,
                                explorerURL: '',
                                loading: true,
                              });
                              this.payFromAnySource({...token, index: i});
                            } catch (error) {
                              console.log(error);
                              await this.setStateAsync({loading: false});
                            }
                          }}>
                          <Text style={GlobalStyles.buttonText}>
                            {token.name}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Fragment key={`${token.name}`} />
                    ),
                  )}
                </ScrollView>
              </React.Fragment>
            )}
            {
              // Stage 3
              this.state.stage === 3 && (
                <View
                  style={{
                    paddingTop: 20,
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'space-between',
                  }}>
                  <Image
                    source={checkMark}
                    alt="check"
                    style={{width: 200, height: 200}}
                  />
                  <Text
                    style={{
                      textShadowRadius: 1,
                      fontSize: 28,
                      fontWeight: 'bold',
                      color:
                        this.state.explorerURL === ''
                          ? secondaryColor
                          : mainColor,
                    }}>
                    {this.state.explorerURL === ''
                      ? 'Processing...'
                      : 'Completed'}
                  </Text>
                  <View
                    style={[
                      GlobalStyles.networkShow,
                      {
                        width: Dimensions.get('screen').width * 0.9,
                      },
                    ]}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-around',
                      }}>
                      <View style={{marginHorizontal: 20}}>
                        <Text style={{fontSize: 20, color: 'white'}}>
                          Transaction
                        </Text>
                        <Text style={{fontSize: 14, color: 'white'}}>
                          {this.state.kindPayment === 0
                            ? 'Card Payment'
                            : this.state.kindPayment === 1
                            ? 'DID Payment'
                            : 'FaceDID Payment'}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={{
                        marginHorizontal: 20,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <View style={{marginHorizontal: 10}}>
                        {this.state.transactionDisplay.icon}
                      </View>
                      <Text style={{color: 'white'}}>
                        {`${deleteLeadingZeros(
                          formatInputText(this.state.transactionDisplay.amount),
                        )}`}{' '}
                        {this.state.transactionDisplay.name}
                      </Text>
                    </View>
                  </View>
                  <View style={GlobalStyles.buttonContainer}>
                    <Pressable
                      disabled={this.state.explorerURL === ''}
                      style={[
                        GlobalStyles.buttonStyle,
                        this.state.explorerURL === ''
                          ? {opacity: 0.5, borderColor: 'black'}
                          : {},
                      ]}
                      onPress={() => Linking.openURL(this.state.explorerURL)}>
                      <Text style={GlobalStyles.buttonText}>
                        View on Explorer
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        GlobalStyles.buttonStyle,
                        {
                          backgroundColor: secondaryColor,
                          borderColor: secondaryColor,
                        },
                        this.state.explorerURL === ''
                          ? {opacity: 0.5, borderColor: 'black'}
                          : {},
                      ]}
                      onPress={async () => {
                        this.print();
                      }}
                      disabled={this.state.explorerURL === ''}>
                      <Text style={GlobalStyles.buttonText}>Show Receipt</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        GlobalStyles.buttonStyle,
                        {
                          backgroundColor: tertiaryColor,
                          borderColor: tertiaryColor,
                        },
                        this.state.explorerURL === ''
                          ? {opacity: 0.5, borderColor: 'black'}
                          : {},
                      ]}
                      onPress={async () => {
                        this.setState({
                          stage: 0,
                          explorerURL: '',
                          check: 'Check',
                          errorText: '',
                          amount: '0.00', // "0.00"
                        });
                      }}
                      disabled={this.state.explorerURL === ''}>
                      <Text style={GlobalStyles.buttonText}>Done</Text>
                    </Pressable>
                  </View>
                </View>
              )
            }
          </View>
        </SafeAreaView>
        <View
          style={{
            position: 'absolute',
            bottom: -(Dimensions.get('screen').height * 1.1),
          }}>
          <QRCode
            value={
              this.state.explorerURL === ''
                ? 'placeholder'
                : this.state.explorerURL
            }
            size={Dimensions.get('window').width * 0.6}
            ecl="L"
            getRef={c => (this.svg = c)}
          />
        </View>
      </Fragment>
    );
  }
}

export default PaymentWallet;
