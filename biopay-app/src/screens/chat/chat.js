import {ethers} from 'ethers';
import React, {Component} from 'react';
import {
  Dimensions,
  Keyboard,
  Modal,
  NativeEventEmitter,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {SafeAreaView} from 'react-native-safe-area-context';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Header from '../../components/header';
import GlobalStyles, {header, main, mainColor} from '../../styles/styles';
import {blockchain, blockchains, USDCicon} from '../../utils/constants';
import ContextModule from '../../utils/contextModule';
import {
  decrypt,
  encrypt,
  findIndexByProperty,
  getAsyncStorageValue,
  removeDuplicatesByKey,
  setAsyncStorageValue,
} from '../../utils/utils';
import {abiMultiChainChat} from '../../contracts/multiChainChat';
import { IotaClient } from '@iota/iota-sdk/client';

const chatBaseState = {
  loading: false,
  chainSelectorVisible: false,
  usdcVisible: false,
  inputHeight: 'auto',
  message: '',
  amount: '',
};
const chains = blockchains.slice(1, blockchains.length);
let colorByWChainId = {};
chains.forEach(x => {
  colorByWChainId[x.wormholeChainId] = x.color;
});

export default class Chat extends Component {
  constructor(props) {
    super(props);
    this.state = chatBaseState;
    this.client = new IotaClient({url: blockchain.rpc});
    this.controller = new AbortController();
    this.EventEmitter = new NativeEventEmitter();
    this.scrollView = null;
    this.refresh = null;
  }

  static contextType = ContextModule;

  async componentDidMount() {
    this.props.navigation.addListener('focus', async () => {
      console.log(this.props.route.name);
      this.scrollView.scrollToEnd({animated: true});
      this.EventEmitter.addListener('refresh', async () => {
        this.setState(chatBaseState);
        Keyboard.dismiss();
        await setAsyncStorageValue({lastRefreshChat: Date.now()});
        this.getMessages();
      });
      this.refresh = setInterval(async () => {
        await this.getMessages();
      }, 10000);
    });
    this.props.navigation.addListener('blur', async () => {
      this.setState(chatBaseState);
      this.EventEmitter.removeAllListeners('refresh');
      this.refresh && clearInterval(this.refresh);
    });
  }

  componentWillUnmount() {
    this.EventEmitter.removeAllListeners('refresh');
    this.refresh && clearInterval(this.refresh);
  }

  async sendMessage() {
    const index = findIndexByProperty(
      chains,
      'wormholeChainId',
      this.context.value.fromChain,
    );
    const index2 = findIndexByProperty(
      chains,
      'wormholeChainId',
      this.context.value.toChain,
    );
    const crossChainFlag =
      this.context.value.fromChain !== this.context.value.toChain;
    const to = this.props.route.params?.address;
    const [iv, messFrom] = await encrypt(
      this.state.message,
      this.context.value.wallets.eth.address,
    );
    const [_, messTo] = await encrypt(this.state.message, to, iv);
    const chatInterface = new ethers.utils.Interface(abiMultiChainChat);
    const chat = new ethers.Contract(
      chains[index].crossChainChat,
      abiMultiChainChat,
      this.provider[index],
    );
    const relayer = new ethers.Contract(
      chains[index].circleRelayer,
      abiCircleRelayer,
      this.provider[index],
    );
    let transaction = {};
    let transactionSavings = {};
    let savings = 0;
    let totalAmount = ethers.BigNumber.from("0");
    if (crossChainFlag) {
      // Dynamically quote the cross-chain cost
      const gas_limit = 700_000;
      const quote = await chat.quoteCrossChainCost(
        this.context.value.toChain,
        gas_limit,
      );
      try {
        if (this.state.amount !== '' && parseFloat(this.state.amount) > 0) {
          const relayerFee = relayer.relayerFee(
            this.context.value.toChain,
            blockchains[index].USDC
          )
          const amount = ethers.utils.parseUnits(this.state.amount, 6);
          totalAmount = totalAmount.add(amount);
          totalAmount = totalAmount.add(relayerFee);
        }
      } catch (e) {
        console.log(e);
      }
      const data = chatInterface.encodeFunctionData('sendMessage', [
        this.context.value.toChain,
        chains[index2].crossChainChat,
        gas_limit,
        to,
        messFrom,
        messTo,
        iv,
        totalAmount,
      ]);
      transaction = {
        from: this.context.value.wallets.eth.address,
        to: chains[index].crossChainChat,
        data,
        value: quote,
      };
    } else {
      const data = chatInterface.encodeFunctionData('addMessage', [
        to,
        ethers.utils.parseUnits(
          this.state.amount === '' ? '0' : this.state.amount,
          6,
        ),
        messFrom,
        messTo,
        iv,
      ]);
      transaction = {
        from: this.context.value.wallets.eth.address,
        to: chains[index].crossChainChat,
        data,
        value: ethers.utils.parseEther('0'),
      };
    }
    this.context.setValue({
      isTransactionActive: true,
      transactionData: {
        // Wallet Selection
        walletSelector: 0,
        // Commands
        command: 'sendMessage',
        chainSelected: index + 1,
        tokenSelected: 1,
        // Transaction
        transaction,
        // With Savings
        withSavings: false,
        transactionSavings,
        // Single Display
        // Display
        label: crossChainFlag ? 'Send Cross Chain' : 'Send On Chain',
        to,
        amount: ethers.utils.formatUnits(totalAmount, 6),
        tokenSymbol: 'USDC',
        // Display Savings
        savedAmount: savings,
      },
    });
    await this.setStateAsync({loading: false});
  }

  async getMessages() {
    const chatContracts = chains.map(
      (x, i) =>
        new ethers.Contract(
          x.crossChainChat,
          abiMultiChainChat,
          this.provider[i],
        ),
    );
    const counterByAddresses = await Promise.all(
      chatContracts.map(contract =>
        contract.chatCounter(this.context.value.wallets.eth.address),
      ),
    );
    // Chat Counters
    const chatCounters = counterByAddresses.map(x => x.toNumber());
    let memoryChatCounters = await getAsyncStorageValue('memoryChatCounters');
    if (memoryChatCounters === null) {
      console.log('memoryChatCounters is null');
      setAsyncStorageValue({memoryChatCounters: [0, 0, 0]});
      memoryChatCounters = [0, 0, 0];
    }
    let memoryMessages = await getAsyncStorageValue('memoryMessages');
    if (memoryMessages === null) {
      console.log('memoryMessages is null');
      setAsyncStorageValue({memoryMessages: []});
      memoryMessages = [];
    }
    let messages = memoryMessages;
    if (chatCounters.some((value, i) => value > memoryChatCounters[i])) {
      // Avoid fetching if there are no messages in the chat
      for (const [index, counter] of chatCounters.entries()) {
        for (let i = memoryChatCounters[index]; counter > i; i++) {
          const message = await chatContracts[index].chatHistory(
            this.context.value.wallets.eth.address,
            i,
          );
          let myJson;
          if (
            this.context.value.wallets.eth.address === message.to.toLowerCase()
          ) {
            myJson = {
              fromChainId: message.fromChainId,
              toChainId: message.toChainId,
              from: message.from,
              to: message.to,
              message: decrypt(
                message.messTo,
                this.context.value.wallets.eth.address,
                message.iv,
              ),
              amount: ethers.utils.formatUnits(message.amount, 6),
              blocktime: message.blocktime.toNumber() * 1000,
              index: i,
            };
            messages.push(myJson);
          } else if (
            this.context.value.wallets.eth.address ===
            message.from.toLowerCase()
          ) {
            myJson = {
              fromChainId: message.fromChainId,
              toChainId: message.toChainId,
              from: message.from,
              to: message.to,
              message: decrypt(
                message.messFrom,
                this.context.value.wallets.eth.address,
                message.iv,
              ),
              amount: ethers.utils.formatUnits(message.amount, 6),
              blocktime: message.blocktime.toNumber() * 1000,
              index: i,
            };
            messages.push(myJson);
          }
        }
      }
      // This function can be optimized
      const chat = messages
        .sort((a, b) => a.blocktime - b.blocktime)
        .map((x, _, arr) => {
          let json = {};
          if (
            x.from.toLowerCase() ===
            this.context.value.wallets.eth.address.toLowerCase()
          ) {
            json['address'] = x.to;
          } else {
            json['address'] = x.from;
          }
          json['messages'] = arr.filter(
            y => y.to === json['address'] || y.from === json['address'],
          );
          json['messages'] = removeDuplicatesByKey(
            [...json['messages']],
            'blocktime',
          );
          json['timestamp'] = x.blocktime;
          return json;
        });
      let chatGeneral = removeDuplicatesByKey(chat, 'address');
      chatGeneral = chatGeneral.sort((a, b) => b.timestamp - a.timestamp);
      await setAsyncStorageValue({chatGeneral});
      await setAsyncStorageValue({memoryMessages: messages});
      await setAsyncStorageValue({memoryChatCounters: chatCounters});
      this.context.setValue({
        chatGeneral,
      });
    } else {
      //ToastAndroid.show('No new messages', ToastAndroid.SHORT);
    }
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
        <Modal
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
          }}
          visible={this.state.chainSelectorVisible}
          transparent={true}
          animationType="slide">
          <View
            style={{
              height: Dimensions.get('window').height,
              width: Dimensions.get('window').width,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
            }}>
            <View
              style={{
                marginTop: Dimensions.get('window').height * 0.2,
                height: Dimensions.get('window').height * 0.6,
                width: '100%',
                justifyContent: 'space-around',
                alignItems: 'center',
                borderWidth: 2,
                borderRadius: 25,
                borderColor: mainColor,
                backgroundColor: '#000000',
              }}>
              <View
                style={{
                  height: '40%',
                  justifyContent: 'space-evenly',
                  alignItems: 'center',
                  width: '100%',
                }}>
                <Text
                  style={{
                    color: 'white',
                    textAlign: 'center',
                    textAlignVertical: 'center',
                    fontFamily: 'Exo2-Regular',
                    fontSize: 24,
                  }}>
                  Select Origin Chain
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-around',
                    alignItems: 'center',
                    width: '100%',
                  }}>
                  {chains.map((x, i) => (
                    <Pressable
                      key={i}
                      onPress={async () => {
                        this.context.setValue({
                          fromChain: x.wormholeChainId,
                        });
                        await setAsyncStorageValue({
                          fromChain: x.wormholeChainId,
                        });
                      }}
                      style={{
                        borderColor:
                          x.wormholeChainId === this.context.value.fromChain
                            ? 'white'
                            : null,
                        borderWidth: 2,
                        borderRadius: 50,
                        padding: 6,
                      }}>
                      {x.tokens[0].icon}
                    </Pressable>
                  ))}
                </View>
              </View>
              <View
                style={{
                  height: '40%',
                  justifyContent: 'space-evenly',
                  alignItems: 'center',
                  width: '100%',
                }}>
                <Text
                  style={{
                    color: 'white',
                    textAlign: 'center',
                    textAlignVertical: 'center',
                    fontFamily: 'Exo2-Regular',
                    fontSize: 24,
                  }}>
                  Select Destination Chain
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-around',
                    alignItems: 'center',
                    width: '100%',
                  }}>
                  {chains.map((x, i) => (
                    <Pressable
                      key={i}
                      onPress={async () => {
                        this.context.setValue({
                          toChain: x.wormholeChainId,
                        });
                        setAsyncStorageValue({toChain: x.wormholeChainId});
                      }}
                      style={{
                        borderColor:
                          x.wormholeChainId === this.context.value.toChain
                            ? 'white'
                            : null,
                        borderWidth: 2,
                        borderRadius: 50,
                        padding: 6,
                      }}>
                      {x.tokens[0].icon}
                    </Pressable>
                  ))}
                </View>
              </View>
              <Pressable
                onPress={() => this.setState({chainSelectorVisible: false})}
                style={[GlobalStyles.buttonStyle, {marginBottom: 12}]}>
                <Text
                  style={{
                    color: 'white',
                    textAlign: 'center',
                    textAlignVertical: 'center',
                    fontFamily: 'Exo2-Regular',
                    fontSize: 24,
                  }}>
                  Done
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <Modal
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
          }}
          visible={this.state.usdcVisible}
          transparent={true}
          animationType="slide">
          <View
            style={{
              height: Dimensions.get('window').height,
              width: Dimensions.get('window').width,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
            }}>
            <View
              style={{
                marginTop: Dimensions.get('window').height * 0.35,
                height: Dimensions.get('window').height * 0.3,
                width: '100%',
                justifyContent: 'space-around',
                alignItems: 'center',
                borderWidth: 2,
                borderRadius: 25,
                borderColor: mainColor,
                backgroundColor: '#000000',
              }}>
              <Text style={GlobalStyles.formTitleCard}>USDC Amount</Text>
              <View
                style={{
                  width: Dimensions.get('screen').width,
                  flexDirection: 'row',
                  justifyContent: 'space-around',
                  alignItems: 'center',
                }}>
                <View style={{width: '100%'}}>
                  <TextInput
                    onPressOut={() =>
                      this.scrollView.scrollToEnd({animated: true})
                    }
                    onChange={() =>
                      this.scrollView.scrollToEnd({animated: true})
                    }
                    onFocus={() =>
                      this.scrollView.scrollToEnd({animated: true})
                    }
                    style={[GlobalStyles.input]}
                    keyboardType="decimal-pad"
                    value={this.state.amount}
                    onChangeText={amount => {
                      this.setState({amount});
                    }}
                  />
                </View>
              </View>
              <Pressable
                onPress={() => {
                  this.setState({usdcVisible: false});
                  this.scrollView.scrollToEnd({animated: true});
                }}
                style={[GlobalStyles.buttonStyle, {marginBottom: 12}]}>
                <Text
                  style={{
                    color: 'white',
                    textAlign: 'center',
                    textAlignVertical: 'center',
                    fontFamily: 'Exo2-Regular',
                    fontSize: 24,
                  }}>
                  Done
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <Text
          style={{
            position: 'absolute',
            top: header,
            height: 40,
            fontSize: 16,
            color: 'white',
            textAlign: 'center',
          }}>
          {'To: '}
          {this.props.route.params?.address.substring(0, 12)}
          {'...'}
          {this.props.route.params?.address.substring(
            this.props.route.params?.address.length - 10,
            this.props.route.params?.address.length,
          )}
        </Text>
        <ScrollView
          ref={view => {
            this.scrollView = view;
          }}
          showsVerticalScrollIndicator={false}
          style={{
            height: main,
            width: Dimensions.get('window').width,
            marginTop: header + 40,
          }}
          contentContainerStyle={[
            GlobalStyles.tab3ScrollContainer,
            {
              height: 'auto',
              paddingHorizontal: 10,
            },
          ]}>
          {this.context.value.chatGeneral
            .filter(
              x =>
                x.address.toLowerCase() ===
                this.props.route.params?.address.toLowerCase(),
            )[0]
            .messages.map((message, i, array) => {
              let flag = false;
              let crosschainFlag = false;
              if (i !== 0) {
                flag = message.from !== array[i - 1].from;
                crosschainFlag = message.fromChainId !== message.toChainId;
              }
              return (
                <LinearGradient
                  angle={90}
                  useAngle={true}
                  key={i}
                  style={{
                    marginTop: flag ? 15 : 5,
                    borderRadius: 10,
                    borderBottomRightRadius:
                      message.from.toLowerCase() ===
                      this.context.value.wallets.eth.address.toLowerCase()
                        ? 0
                        : 10,
                    borderBottomLeftRadius:
                      message.from.toLowerCase() ===
                      this.context.value.wallets.eth.address.toLowerCase()
                        ? 10
                        : 0,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    maxWidth: '80%',
                    alignSelf:
                      message.from.toLowerCase() ===
                      this.context.value.wallets.eth.address.toLowerCase()
                        ? 'flex-end'
                        : 'flex-start',
                  }}
                  colors={[
                    message.from.toLowerCase() ===
                    this.context.value.wallets.eth.address.toLowerCase()
                      ? colorByWChainId[message.fromChainId] + 'cc'
                      : colorByWChainId[message.fromChainId] + '40',
                    message.from.toLowerCase() ===
                    this.context.value.wallets.eth.address.toLowerCase()
                      ? colorByWChainId[message.toChainId] + 'cc'
                      : colorByWChainId[message.toChainId] + '40',
                  ]}>
                  <Text
                    style={{
                      color: 'white',
                      textAlign: 'justify',
                      marginBottom: 10,
                      fontSize: 16,
                    }}>
                    {message.message}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}>
                    {message.amount > 0 ? (
                      <Text style={{color: 'white', fontSize: 12}}>
                        {message.amount} USDC{' '}
                        {crosschainFlag ? 'with CCTP' : ''}
                      </Text>
                    ) : (
                      <View />
                    )}
                    <Text
                      style={{
                        color: '#cccccc',
                        alignSelf: 'flex-end',
                        fontSize: 12,
                        marginRight: -10,
                        marginBottom: -5,
                      }}>
                      {new Date(message.blocktime).toLocaleTimeString()}
                    </Text>
                  </View>
                </LinearGradient>
              );
            })}
        </ScrollView>
        {parseFloat(this.state.amount ?? '0') > 0 && (
          <View
            style={{
              marginTop: 14,
              width: '100%',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 10,
            }}>
            <Text style={{color: 'white', fontSize: 20}}>
              Amount Transferred: {this.state.amount} USDC
            </Text>
            {USDCicon}
          </View>
        )}
        <View
          style={[
            {
              height: 'auto',
              width: '100%',
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              marginBottom: 10,
            },
          ]}>
          <Pressable
            onPress={() => this.setState({usdcVisible: true})}
            style={{
              width: '10%',
              height: 'auto',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: mainColor,
              borderRadius: 50,
              aspectRatio: 1,
              marginBottom: 5,
            }}>
            <FontAwesome name="dollar" size={22} color="white" />
          </Pressable>
          <Pressable
            onPress={() => this.setState({chainSelectorVisible: true})}
            style={{
              width: '10%',
              height: 'auto',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: mainColor,
              borderRadius: 50,
              aspectRatio: 1,
              marginBottom: 5,
            }}>
            <Ionicons name="settings-sharp" size={22} color="white" />
          </Pressable>
          <TextInput
            onPressOut={() => this.scrollView.scrollToEnd({animated: true})}
            onChange={() => this.scrollView.scrollToEnd({animated: true})}
            onFocus={() => this.scrollView.scrollToEnd({animated: true})}
            multiline
            onContentSizeChange={async event => {
              if (event.nativeEvent.contentSize.height < 120) {
                await this.setStateAsync({
                  inputHeight: event.nativeEvent.contentSize.height,
                });
                this.scrollView.scrollToEnd({animated: true});
              }
            }}
            style={[
              GlobalStyles.inputChat,
              {
                height: this.state.inputHeight,
              },
            ]}
            keyboardType="default"
            value={this.state.message}
            onChangeText={value => {
              this.setState({message: value});
            }}
          />
          <Pressable
            onPress={async () => {
              await this.sendMessage();
            }}
            style={{
              width: '10%',
              height: 'auto',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: mainColor,
              borderRadius: 50,
              aspectRatio: 1,
              marginBottom: 5,
            }}>
            <Ionicons name="send" size={22} color="white" />
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}
