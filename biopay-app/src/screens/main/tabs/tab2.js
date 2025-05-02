import {IotaClient} from '@iota/iota-sdk/client';
import {Ed25519Keypair} from '@iota/iota-sdk/keypairs/ed25519';
import Slider from '@react-native-community/slider';
import {ethers, formatUnits} from 'ethers';
import React, {Component, Fragment} from 'react';
import {
  Dimensions,
  NativeEventEmitter,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import RNPickerSelect from 'react-native-picker-select';
import Crypto from 'react-native-quick-crypto';
import GlobalStyles, {mainColor} from '../../../styles/styles';
import {
  blockchain,
  CloudPublicKeyEncryption,
  refreshTime,
} from '../../../utils/constants';
import ContextModule from '../../../utils/contextModule';
import {
  arraySum,
  epsilonRound,
  formatDate,
  getAsyncStorageValue,
  setAsyncStorageValue,
  setEncryptedStorageValue,
} from '../../../utils/utils';

const periodsAvailable = [
  {
    label: 'Daily',
    value: 1,
    periodValue: 86400,
  },
  {
    label: 'Weekly',
    value: 2,
    periodValue: 604800,
  },
  {
    label: 'Monthly',
    value: 3,
    periodValue: 2629800,
  },
  {
    label: 'Yearly',
    value: 4,
    periodValue: 31557600,
  },
];

const protocolsAvailable = [
  {
    label: 'Balanced',
    value: 1,
  },
  {
    label: 'Percentage',
    value: 2,
  },
];

const baseTab2State = {
  refreshing: false,
  loading: false,
  sliderDisabled: true,
  slider: 1,
};

export default class Tab2 extends Component {
  constructor(props) {
    super(props);
    this.state = baseTab2State;
    this.client = new IotaClient({url: blockchain.rpc});
    this.EventEmitter = new NativeEventEmitter();
  }

  static contextType = ContextModule;

  async getLastRefreshSavings() {
    try {
      const lastRefreshSavings = await getAsyncStorageValue(
        'lastRefreshSavings',
      );
      if (lastRefreshSavings === null) throw 'Set First Date';
      return lastRefreshSavings;
    } catch (err) {
      await setAsyncStorageValue({lastRefreshSavings: 0});
      return 0;
    }
  }

  async componentDidMount() {
    this.setState({
      slider: this.context.value.percentage,
    });
    const {publicKeySavings} = this.context.value;
    if (publicKeySavings !== '') {
      // Event Emitter
      this.EventEmitter.addListener('refresh', async () => {
        await setAsyncStorageValue({lastRefreshSavings: Date.now()});
        this.refresh();
      });
      // Get Last Refresh
      const lastRefresh = await this.getLastRefreshSavings();
      if (Date.now() - lastRefresh >= refreshTime) {
        console.log('Refreshing...');
        await setAsyncStorageValue({lastRefreshSavings: Date.now()});
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
    await this.getSavingsBalance();
    await this.setStateAsync({refreshing: false});
  }

  // Get Balances

  async getSavingsBalance() {
    const {publicKeySavings} = this.context.value;
    const {tokens} = blockchain;
    const coins = await this.client.getAllBalances({
      owner: publicKeySavings,
    });
    const balancesSavings = tokens.map(token => {
      const coin = coins.find(coin => coin.coinType === token.coinType);
      return coin ? coin.totalBalance : 0;
    });
    setAsyncStorageValue({balancesSavings});
    this.context.setValue({balancesSavings});
  }

  async changePeriod() {
    const savingsDate =
      Date.now() +
      periodsAvailable[this.context.value.periodSelected - 1].periodValue *
        1000;
    await setAsyncStorageValue({savingsDate});
    this.context.setValue({savingsDate});
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

  createWallet() {
    this.setState({
      loading: true,
    });
    setTimeout(async () => {
      const wallet = ethers.Wallet.createRandom();
      const keypair = Ed25519Keypair.deriveKeypair(wallet.mnemonic.phrase);
      const publicKeySavings = keypair.getPublicKey().toIotaAddress();
      const privateKeySavings = keypair.getSecretKey();
      const mnemonicSavings = wallet.mnemonic.phrase;
      await setEncryptedStorageValue({
        mnemonicSavings,
        privateKeySavings,
      });
      await setAsyncStorageValue({
        publicKeySavings,
      });
      this.context.setValue({
        publicKeySavings,
      });
      await this.setStateAsync({
        loading: false,
      });
      this.componentDidMount();
    }, 100);
  }

  async transfer() {
    // To be done
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
          <RefreshControl
            progressBackgroundColor={mainColor}
            refreshing={this.state.refreshing}
            onRefresh={async () => {
              await setAsyncStorageValue({
                lastRefreshSavings: Date.now().toString(),
              });
              await this.refresh();
            }}
          />
        }
        style={GlobalStyles.tab2Container}
        contentContainerStyle={[GlobalStyles.tab2ScrollContainer]}>
        {this.context.value.publicKeySavings !== '' ? (
          <Fragment>
            <LinearGradient
              style={{
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                marginVertical: 40,
              }}
              colors={['#000000', '#1a1a1a', '#000000']}>
              <Text style={[GlobalStyles.title]}>Savings Balance</Text>
              <Text style={[GlobalStyles.balance]}>
                {`$ ${epsilonRound(
                  arraySum(
                    this.context.value.balancesSavings
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
                justifyContent: 'flex-start',
                alignItems: 'center',
                width: '90%',
                gap: 25,
              }}>
              <View
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignContent: 'center',
                  width: '100%',
                }}>
                <Text style={[GlobalStyles.formTitle]}>Activate Savings</Text>
                <Switch
                  style={{
                    transform: [{scaleX: 1.3}, {scaleY: 1.3}],
                  }}
                  trackColor={{
                    false: '#3e3e3e',
                    true: mainColor + '77',
                  }}
                  thumbColor={
                    this.context.value.savingsFlag ? mainColor : '#f4f3f4'
                  }
                  ios_backgroundColor="#3e3e3e"
                  onValueChange={async () => {
                    await setAsyncStorageValue({
                      savingsFlag: !this.context.value.savingsFlag,
                    });
                    await this.context.setValue({
                      savingsFlag: !this.context.value.savingsFlag,
                    });
                  }}
                  value={this.context.value.savingsFlag}
                />
              </View>
              {this.context.value.savingsFlag && (
                <React.Fragment>
                  <View
                    style={{
                      borderColor: mainColor,
                    }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        width: '100%',
                      }}>
                      <Text style={[GlobalStyles.formTitle]}>
                        Savings Period
                      </Text>
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
                            width: '55%',
                          },
                        }}
                        value={this.context.value.periodSelected}
                        items={periodsAvailable}
                        onValueChange={async value => {
                          await setAsyncStorageValue({
                            periodSelected: value,
                          });
                          await this.context.setValue({
                            periodSelected: value,
                          });
                        }}
                      />
                    </View>
                    <Pressable
                      disabled={this.state.loading}
                      style={[
                        GlobalStyles.buttonStyle,
                        this.state.loading ? {opacity: 0.5} : {},
                      ]}
                      onPress={async () => {
                        await this.setStateAsync({loading: true});
                        await this.changePeriod();
                        await this.setStateAsync({loading: false});
                      }}>
                      <Text
                        style={{
                          color: 'white',
                          fontSize: 18,
                          fontWeight: 'bold',
                        }}>
                        {this.state.loading
                          ? 'Changing...'
                          : 'Change Savings Period'}
                      </Text>
                    </Pressable>
                  </View>
                  <View
                    style={{
                      width: '100%',
                    }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        width: '100%',
                      }}>
                      <Text style={[GlobalStyles.formTitle]}>
                        Savings Protocol
                      </Text>
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
                            width: Dimensions.get('screen').width * 0.5,
                          },
                        }}
                        value={this.context.value.protocolSelected}
                        items={protocolsAvailable}
                        onValueChange={async protocolSelected => {
                          await setAsyncStorageValue({
                            protocolSelected,
                          });
                          await this.context.setValue({
                            protocolSelected,
                          });
                        }}
                      />
                    </View>
                    {this.context.value.protocolSelected === 2 && (
                      <View
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignContent: 'center',
                          width: '100%',
                        }}>
                        <Slider
                          value={this.state.slider}
                          style={{
                            width: '85%',
                            height: 40,
                          }}
                          step={1}
                          minimumValue={1}
                          maximumValue={15}
                          minimumTrackTintColor="#FFFFFF"
                          maximumTrackTintColor={mainColor}
                          onValueChange={async value => {
                            await setAsyncStorageValue({
                              percentage: value,
                            });
                            await this.context.setValue({
                              percentage: value,
                            });
                          }}
                        />
                        <Text
                          style={{
                            width: '15%',
                            fontSize: 24,
                            color: '#FFF',
                            fontWeight: 'bold',
                          }}>
                          {this.context.value.percentage}%
                        </Text>
                      </View>
                    )}
                  </View>
                  <View
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignContent: 'center',
                      width: '100%',
                    }}>
                    <Text style={[GlobalStyles.formTitle]}>
                      Next Withdraw Date
                    </Text>
                    <Pressable
                      disabled={
                        this.state.loading ||
                        !(this.context.value.savingsDate < Date.now())
                      }
                      style={[
                        GlobalStyles.buttonStyle,
                        {width: '50%'},
                        this.state.loading ||
                        !(this.context.value.savingsDate < Date.now())
                          ? {opacity: 0.5}
                          : {},
                      ]}
                      onPress={async () => {
                        await this.setStateAsync({loading: true});
                        //await this.transfer(); // to be done
                        await this.setStateAsync({loading: false});
                      }}>
                      <Text
                        style={{
                          color: 'white',
                          fontSize: 18,
                          fontWeight: 'bold',
                        }}>
                        {!(this.context.value.savingsDate < Date.now())
                          ? formatDate(new Date(this.context.value.savingsDate))
                          : this.state.loading
                          ? 'Withdrawing...'
                          : 'Withdraw Now'}
                      </Text>
                    </Pressable>
                  </View>
                </React.Fragment>
              )}
            </View>
          </Fragment>
        ) : (
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              width: '90%',
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
              Create Savings Account
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
                onPress={() => this.createWallet()}>
                <Text style={[GlobalStyles.buttonText]}>
                  {this.state.loading ? 'Creating...' : 'Create Account'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    );
  }
}
