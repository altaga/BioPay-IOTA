import {IotaClient} from '@iota/iota-sdk/client';
import {decodeIotaPrivateKey} from '@iota/iota-sdk/cryptography';
import {Ed25519Keypair} from '@iota/iota-sdk/keypairs/ed25519';
import {SerialTransactionExecutor} from '@iota/iota-sdk/transactions';
import {formatUnits} from 'ethers';
import React, {Component, Fragment} from 'react';
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  NativeEventEmitter,
  Pressable,
  Text,
  View,
} from 'react-native';
import Crypto from 'react-native-quick-crypto';
import checkMark from '../assets/checkMark.png';
import GlobalStyles, {mainColor, secondaryColor} from '../styles/styles';
import {blockchain, CloudPublicKeyEncryption} from './constants';
import ContextModule from './contextModule';
import {epsilonRound, getEncryptedStorageValue, verifyWallet} from './utils';

const baseTransactionsModalState = {
  stage: 0, // 0
  loading: true,
  explorerURL: '',
  gas: 0,
};

class TransactionsModal extends Component {
  constructor(props) {
    super(props);
    this.state = baseTransactionsModalState;
    this.client = new IotaClient({url: blockchain.rpc});
    this.controller = new AbortController();
    this.EventEmitter = new NativeEventEmitter();
  }

  static contextType = ContextModule;

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

  async checkTransaction() {
    const transaction = this.context.value.transactionData.transaction;
    const {publicKey} = this.context.value;
    transaction.setSender(publicKey);
    const txBytes = await transaction.build({client: this.client});
    const data = await this.client.dryRunTransactionBlock({
      transactionBlock: txBytes,
    });
    let gas = parseInt(data.input.gasData.budget);
    if (this.context.value.transactionData.withSavings) {
      const savingsTransaction =
        this.context.value.transactionData.transactionSavings;
      savingsTransaction.setSender(publicKey);
      const savingsTxBytes = await savingsTransaction.build({
        client: this.client,
      });
      const savingsData = await this.client.dryRunTransactionBlock({
        transactionBlock: savingsTxBytes,
      });
      console.log(savingsData);
      const savingsGasUsed = parseInt(savingsData.input.gasData.budget);
      console.log(savingsGasUsed);
      gas += savingsGasUsed;
    }
    await this.setStateAsync({
      loading: false,
      gas,
    });
  }

  async processTransaction() {
    await this.setStateAsync({loading: true, stage: 1});
    const privateKey = await getEncryptedStorageValue('privateKey');
    const decodedPrivateKey = decodeIotaPrivateKey(privateKey);
    const signer = Ed25519Keypair.fromSecretKey(decodedPrivateKey.secretKey);
    const executor = new SerialTransactionExecutor({
      client: this.client,
      signer,
    });
    let transactions = [this.context.value.transactionData.transaction];
    if (this.context.value.transactionData.withSavings) {
      transactions.push(this.context.value.transactionData.transactionSavings);
    }
    const transactionPromises = transactions.map(tx =>
      executor.executeTransaction(tx),
    );
    const result = await Promise.all(transactionPromises);
    await this.setStateAsync({
      loading: false,
      explorerURL: blockchain.blockExplorer + `/tx/${result[0].digest}`,
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
      <Modal
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
        }}
        visible={this.context.value.isTransactionActive}
        transparent={true}
        onShow={async () => {
          await this.setStateAsync(baseTransactionsModalState);
          await this.checkTransaction();
        }}
        animationType="slide">
        <View
          style={{
            height: '100%',
            width: '100%',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderWidth: 2,
            borderRadius: 25,
            borderColor: mainColor,
            backgroundColor: '#000000',
            paddingVertical: 10,
          }}>
          {this.state.stage === 0 && (
            <React.Fragment>
              <View style={{width: '100%', gap: 20, alignItems: 'center'}}>
                <Text
                  style={{
                    textAlign: 'center',
                    color: 'white',
                    fontSize: 18,
                    width: '100%',
                    marginTop: 10,
                  }}>
                  Transaction:
                </Text>
                <Text
                  style={{
                    textAlign: 'center',
                    color: 'white',
                    fontSize: 22,
                    width: '100%',
                    marginBottom: 10,
                  }}>
                  {this.context.value.transactionData.label}
                </Text>
                <Text
                  style={{
                    textAlign: 'center',
                    color: 'white',
                    fontSize: 18,
                    width: '100%',
                    marginTop: 10,
                  }}>
                  To Address:
                </Text>
                <Text
                  style={{
                    textAlign: 'center',
                    color: 'white',
                    fontSize: verifyWallet(
                      this.context.value.transactionData.to,
                    )
                      ? 18
                      : 22,
                    width: '100%',
                    marginBottom: 10,
                  }}>
                  {this.context.value.transactionData.to.substring(
                    Math.floor(
                      (this.context.value.transactionData.to.length * 0) / 3,
                    ),
                    Math.floor(
                      (this.context.value.transactionData.to.length * 1) / 3,
                    ),
                  ) +
                    '\n' +
                    this.context.value.transactionData.to.substring(
                      Math.floor(
                        (this.context.value.transactionData.to.length * 1) / 3,
                      ),
                      Math.floor(
                        (this.context.value.transactionData.to.length * 2) / 3,
                      ),
                    ) +
                    '\n' +
                    this.context.value.transactionData.to.substring(
                      Math.floor(
                        (this.context.value.transactionData.to.length * 2) / 3,
                      ),
                      Math.floor(
                        (this.context.value.transactionData.to.length * 3) / 3,
                      ),
                    )}
                </Text>
                <Text
                  style={{
                    textAlign: 'center',
                    color: 'white',
                    fontSize: 18,
                    width: '100%',
                    marginTop: 10,
                  }}>
                  Amount (or Equivalent):
                </Text>
                <Text
                  style={{
                    textAlign: 'center',
                    color: 'white',
                    fontSize: 20,
                    width: '100%',
                    marginBottom: 10,
                  }}>
                  {epsilonRound(this.context.value.transactionData.amount, 8)}{' '}
                  {this.context.value.transactionData.tokenSymbol}
                  {'\n ( $'}
                  {epsilonRound(
                    this.context.value.transactionData.amount *
                      this.context.value.usdConversion[
                        this.context.value.transactionData.tokenSelected
                      ],
                    6,
                  )}
                  {' USD )'}
                </Text>

                <Text
                  style={{
                    textAlign: 'center',
                    color: 'white',
                    fontSize: 18,
                    width: '100%',
                    marginTop: 10,
                  }}>
                  Gas Budget:
                </Text>
                <Text
                  style={{
                    textAlign: 'center',
                    color: 'white',
                    fontSize: 20,
                    width: '100%',
                    marginBottom: 10,
                  }}>
                  {this.state.loading ? (
                    'Calculating...'
                  ) : (
                    <Fragment>
                      {epsilonRound(
                        parseFloat(
                          formatUnits(this.state.gas, blockchain.decimals),
                        ),
                        8,
                      )}{' '}
                      {blockchain.token}
                      {'\n ( $'}
                      {epsilonRound(
                        parseFloat(
                          formatUnits(this.state.gas, blockchain.decimals),
                        ) * this.context.value.usdConversion[0],
                        6,
                      )}
                      {' USD )'}
                    </Fragment>
                  )}
                </Text>

                {this.context.value.transactionData.withSavings &&
                  this.context.value.transactionData.walletSelector === 0 && (
                    <Text
                      style={{
                        textAlign: 'center',
                        color: 'white',
                        fontSize: 20,
                        width: '100%',
                        marginTop: 10,
                      }}>
                      Saved Amount:{' '}
                      {epsilonRound(
                        this.context.value.transactionData.savedAmount,
                        9,
                      )}{' '}
                      {blockchain.token}
                    </Text>
                  )}
              </View>
              <View style={{gap: 10, width: '100%', alignItems: 'center'}}>
                <Pressable
                  disabled={this.state.loading}
                  style={[
                    GlobalStyles.buttonStyle,
                    this.state.loading ? {opacity: 0.5} : {},
                  ]}
                  onPress={() => {
                    this.setState({
                      loading: true,
                      stage: 1,
                    });
                    this.processTransaction();
                  }}>
                  <Text
                    style={{
                      color: 'white',
                      fontSize: 24,
                      fontWeight: 'bold',
                    }}>
                    Execute
                  </Text>
                </Pressable>
                <Pressable
                  style={[GlobalStyles.buttonCancelStyle]}
                  onPress={async () => {
                    this.context.setValue({
                      isTransactionActive: false,
                    });
                  }}>
                  <Text style={GlobalStyles.buttonCancelText}>Cancel</Text>
                </Pressable>
              </View>
            </React.Fragment>
          )}
          {this.state.stage === 1 && (
            <React.Fragment>
              <Image
                source={checkMark}
                alt="check"
                style={{width: 200, height: 200}}
              />
              <Text
                style={{
                  marginTop: '20%',
                  textShadowRadius: 1,
                  fontSize: 28,
                  fontWeight: 'bold',
                  color: this.state.loading ? mainColor : secondaryColor,
                }}>
                {this.state.loading ? 'Processing...' : 'Completed'}
              </Text>
              <View style={{gap: 10, width: '100%', alignItems: 'center'}}>
                <View
                  style={[
                    GlobalStyles.networkShow,
                    {width: Dimensions.get('screen').width * 0.9},
                  ]}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                    <View style={{marginHorizontal: 20}}>
                      <Text style={{fontSize: 20, color: 'white'}}>
                        Transaction
                      </Text>
                      <Text style={{fontSize: 14, color: 'white'}}>
                        {this.context.value.transactionData.label}
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
                      {
                        blockchain.tokens[
                          this.context.value.transactionData.tokenSelected
                        ].icon
                      }
                    </View>
                    <Text style={{color: 'white'}}>
                      {`${epsilonRound(
                        this.context.value.transactionData.amount,
                        8,
                      )}`}{' '}
                      {
                        blockchain.tokens[
                          this.context.value.transactionData.tokenSelected
                        ].symbol
                      }
                    </Text>
                  </View>
                </View>
                {this.context.value.transactionData.withSavings &&
                  this.context.value.transactionData.walletSelector === 0 && (
                    <View
                      style={[
                        GlobalStyles.networkShow,
                        {width: Dimensions.get('screen').width * 0.9},
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
                            savingsTransfer
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
                          {blockchain.tokens[0].icon}
                        </View>
                        <Text style={{color: 'white'}}>
                          {`${epsilonRound(
                            this.context.value.transactionData.savedAmount,
                            8,
                          )}`}{' '}
                          {blockchain.tokens[0].symbol}
                        </Text>
                      </View>
                    </View>
                  )}
              </View>
              <View style={{gap: 10, width: '100%', alignItems: 'center'}}>
                <Pressable
                  disabled={this.state.loading}
                  style={[
                    GlobalStyles.buttonStyle,
                    this.state.loading ? {opacity: 0.5} : {},
                  ]}
                  onPress={() => Linking.openURL(this.state.explorerURL)}>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: 'bold',
                      color: 'white',
                      textAlign: 'center',
                    }}>
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
                    this.state.loading ? {opacity: 0.5} : {},
                  ]}
                  onPress={async () => {
                    this.EventEmitter.emit('refresh');
                    this.context.setValue(
                      {
                        isTransactionActive: false,
                      },
                      () => this.setState(baseTransactionsModalState),
                    );
                  }}
                  disabled={this.state.loading}>
                  <Text
                    style={{
                      color: 'white',
                      fontSize: 24,
                      fontWeight: 'bold',
                    }}>
                    Done
                  </Text>
                </Pressable>
              </View>
            </React.Fragment>
          )}
        </View>
      </Modal>
    );
  }
}

export default TransactionsModal;
