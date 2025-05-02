// Basic Imports
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { Component } from 'react';
import { Dimensions, Image, View } from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import logoSplash from '../../assets/logoSplash.png';
import GlobalStyles from '../../styles/styles';
import ContextModule from '../../utils/contextModule';
import { getAsyncStorageValue } from '../../utils/utils';

class SplashLoading extends Component {
  constructor(props) {
    super(props);
  }

  static contextType = ContextModule;

  async componentDidMount() {
    this.props.navigation.addListener('focus', async () => {
      // DEBUG ONLY
      //await this.erase();
      console.log(this.props.route.name);
      const publicKey = await getAsyncStorageValue('publicKey');
      if (publicKey) { // Null is falsy
        // Main wallet
        const balances = await getAsyncStorageValue('balances');
        // DID wallet
        const publicKeyDID = await getAsyncStorageValue('publicKeyDID');
        const balancesDID = await getAsyncStorageValue('balancesDID');
        // Savings wallet
        const publicKeySavings = await getAsyncStorageValue('publicKeySavings');
        const periodSelected = await getAsyncStorageValue('periodSelected');
        const protocolSelected = await getAsyncStorageValue('protocolSelected');
        const percentage = await getAsyncStorageValue('percentage');
        const savingsFlag = await getAsyncStorageValue('savingsFlag');
        const balancesSavings = await getAsyncStorageValue('balancesSavings');
        const savingsDate = await getAsyncStorageValue('savingsDate');
        // Card wallet
        const publicKeyCard = await getAsyncStorageValue('publicKeyCard');
        const balancesCard = await getAsyncStorageValue('balancesCard');
        // Chat
        const chatGeneral = await getAsyncStorageValue('chatGeneral');
        // Shared
        const usdConversion = await getAsyncStorageValue('usdConversion');
        this.context.setValue({
          // Base Wallet
          publicKey: publicKey ?? this.context.value.publicKey,
          balances: balances ?? this.context.value.balances,
          publicKeyDID : publicKeyDID ?? this.context.value.publicKeyDID,
          balancesDID : balancesDID ?? this.context.value.balancesDID,
          // Savings Wallet
          publicKeySavings: publicKeySavings ?? this.context.value.publicKeySavings,
          periodSelected: periodSelected ?? this.context.value.periodSelected,
          protocolSelected:
            protocolSelected ?? this.context.value.protocolSelected,
          percentage: percentage ?? this.context.value.percentage,
          savingsFlag: savingsFlag ?? this.context.value.savingsFlag,
          balancesSavings:
            balancesSavings ?? this.context.value.balancesSavings,
          savingsDate: savingsDate ?? this.context.value.savingsDate,
          // Card Wallet
          publicKeyCard: publicKeyCard ?? this.context.value.publicKeyCard,
          balancesCard: balancesCard ?? this.context.value.balancesCard,
          // Chat 
          //chatGeneral: chatGeneral ?? this.context.value.chatGeneral,
          //fromChain: fromChain ?? this.context.value.fromChain,
          //toChain: toChain ?? this.context.value.toChain,
          // Shared
          usdConversion: usdConversion ?? this.context.value.usdConversion,
        });
        this.props.navigation.navigate('Main'); // Main
      } else {
        this.props.navigation.navigate('Setup');
      }
    });
    this.props.navigation.addListener('blur', async () => { });
  }

  async erase() {
    // DEV ONLY - DON'T USE IN PRODUCTION
    try {
      await EncryptedStorage.clear();
      await AsyncStorage.clear();
    } catch (error) {
      console.log(error);
    }
  }

  render() {
    return (
      <View style={[GlobalStyles.container, { justifyContent: 'center' }]}>
        <Image
          resizeMode="contain"
          source={logoSplash}
          alt="Main Logo"
          style={{
            width: Dimensions.get('window').width,
          }}
        />
      </View>
    );
  }
}

export default SplashLoading;
