import wanUtil from 'wanchain-util';
import BigNumber from 'bignumber.js';
import { observable, action, computed, toJS } from 'mobx';
import Identicon from 'identicon.js';
import btcImg from 'static/image/btc.png';
import ethImg from 'static/image/eth.png';
import eosImg from 'static/image/eos.png';

import wanAddress from './wanAddress';
import ethAddress from './ethAddress';
import btcAddress from './btcAddress';
import eosAddress from './eosAddress';
import { formatNum, formatNumByDecimals, formatTokensList } from 'utils/support';
import { WANPATH, ETHPATH, WALLET_CHAIN, CROSSCHAINTYPE } from 'utils/settings';

class Tokens {
  @observable currTokenAddr = '';

  @observable tokensList = {};

  @observable ccTokensList = {};

  @observable tokensBalance = {};

  @observable E20TokensBalance = {};

  @observable tokenIconList = {}

  @action setCurrToken(addr, symbol) {
    if (symbol) {
      addr = Object.keys(self.formatTokensList).find(item => self.formatTokensList[item].symbol === symbol)
    }
    self.currTokenAddr = addr;
  }

  @action getToken(scAddr) {
    let token = self.tokensList[scAddr];
    if (token.buddy && self.tokensList[token.buddy]) {
      token.iconData = self.tokensList[token.buddy].iconData;
      token.iconType = self.tokensList[token.buddy].iconType;
    }
    return token;
  }

  @action async getTokenIcon(scAddr) {
    const token = self.getToken(scAddr);
    // console.log('token:', token);
    switch (token.symbol) {
      case 'WBTC':
        self.tokenIconList[scAddr] = btcImg;
        break;
      case 'WETH':
        self.tokenIconList[scAddr] = ethImg;
        break;
      case 'WEOS':
        self.tokenIconList[scAddr] = eosImg;
        break;
      default:
        if (token && token.iconData) {
          self.tokenIconList[scAddr] = `data:image/${token.iconType};base64,${token.iconData}`;
        } else {
          wand.request('crossChain_getRegisteredOrigToken', {
            chainType: token.chain,
            options: {
              tokenScAddr: scAddr
            }
          }, (err, data) => {
            if (err || data.length === 0 || !(Object.prototype.hasOwnProperty.call(data[0], 'iconData') && Object.prototype.hasOwnProperty.call(data[0], 'iconType'))) {
              self.tokenIconList[scAddr] = `data:image/png;base64,${new Identicon(scAddr).toString()}`;
            } else {
              self.tokenIconList[scAddr] = `data:image/${data[0].iconType};base64,${data[0].iconData}`;
            }
          });
        }
    }
  }

  @action getTokensInfo() {
    return new Promise((resolve, reject) => {
      wand.request('crossChain_getTokensInfo', {}, (err, data) => {
        if (err) {
          console.log('getTokensInfo: ', err);
          reject(err)
          return;
        }
        self.tokensList = data;
        resolve()
      })
    })
  }

  @action getCcTokensInfo() {
    return new Promise((resolve, reject) => {
      wand.request('crossChain_getCcTokensInfo', {}, (err, data) => {
        if (err) {
          console.log('getCcTokensInfo: ', err);
          reject(err)
          return;
        }
        self.ccTokensList = data;
        resolve()
      })
    })
  }

  @computed get formatTokensList() {
    return formatTokensList(self.ccTokensList)
  }

  @action addCustomToken(tokenInfo) {
    let { tokenAddr } = tokenInfo;
    self.tokensList[tokenAddr.toLowerCase()] = {
      select: tokenInfo.select,
      chain: tokenInfo.chain,
      symbol: tokenInfo.symbol,
      decimals: tokenInfo.decimals
    }
  }

  @action deleteCustomToken(tokenAddr) {
    delete self.tokensList[tokenAddr.toLowerCase()];
  }

  @action updateTokensBalance(tokenScAddr, cb) {
    let normalArr = Object.keys(wanAddress.addrInfo.normal);
    let importArr = Object.keys(wanAddress.addrInfo.import);
    let ledgerArr = Object.keys(wanAddress.addrInfo.ledger);
    let trezorArr = Object.keys(wanAddress.addrInfo.trezor);
    let rawKeyArr = Object.keys(wanAddress.addrInfo.rawKey);

    wand.request('crossChain_updateTokensBalance', { address: normalArr.concat(importArr, ledgerArr, trezorArr, rawKeyArr), tokenScAddr, chain: 'WAN' }, (err, data) => {
      if (err) {
        if (cb) cb(err)
        console.log('stores_getTokensBalance:', err);
        return;
      }
      if (cb) cb(null, data)
      self.tokensBalance[tokenScAddr] = data;
    })
  }

  @action getTokenBalance(item) {
    const { chain, scAddr } = item;
    return new Promise((resolve, reject) => {
      let normalArr = [];
      let importArr = [];
      let ledgerArr = [];
      let trezorArr = [];
      let rawKeyArr = [];

      switch (chain) {
        case 'WAN':
          normalArr = Object.keys(wanAddress.addrInfo['normal'] || []);
          importArr = Object.keys(wanAddress.addrInfo['import'] || []);
          ledgerArr = Object.keys(wanAddress.addrInfo['ledger'] || []);
          trezorArr = Object.keys(wanAddress.addrInfo['trezor'] || []);
          rawKeyArr = Object.keys(wanAddress.addrInfo['rawKey'] || []);
          break;
        case 'ETH':
          normalArr = Object.keys(ethAddress.addrInfo['normal'] || []);
          importArr = Object.keys(ethAddress.addrInfo['import'] || []);
          rawKeyArr = Object.keys(ethAddress.addrInfo['rawKey'] || []);
          break;
        case 'BTC':
          normalArr = Object.keys(btcAddress.addrInfo['normal'] || []);
          importArr = Object.keys(btcAddress.addrInfo['import'] || []);
          rawKeyArr = Object.keys(btcAddress.addrInfo['rawKey'] || []);
          break;
        case 'EOS':
          /* normalArr = Object.keys(eosAddress.keyInfo['normal']);
          importArr = Object.keys(eosAddress.keyInfo['import']); */
          break;
        default:
          console.log('Default.....');
      }
      wand.request('crossChain_updateTokensBalance', { address: normalArr.concat(importArr).concat(ledgerArr).concat(trezorArr).concat(rawKeyArr), tokenScAddr: scAddr, chain: chain }, (err, data) => {
        if (err) {
          console.log('stores_getTokensBalance:', err);
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  @action updateE20TokensBalance(tokenScAddr) {
    let normalArr = Object.keys(ethAddress.addrInfo.normal);
    let rawKeyArr = Object.keys(ethAddress.addrInfo.rawKey);
    wand.request('crossChain_updateTokensBalance', { address: normalArr.concat(rawKeyArr), tokenScAddr, chain: 'ETH' }, (err, data) => {
      if (err) {
        console.log('stores_getTokensBalance:', err);
        return;
      }
      self.E20TokensBalance[tokenScAddr] = data;
    })
  }

  @action updateTokensInfo(addr, key, value) {
    wand.request('crossChain_updateTokensInfo', { addr, key, value }, (err) => {
      if (err) {
        console.log('crossChain_updateTokensInfo: ', err)
        return;
      }
      self.tokensList[addr][key] = value;
    })
  }

  @action updateCcTokensInfo(addr, key, value) {
    wand.request('crossChain_updateCcTokensInfo', { addr, key, value }, (err) => {
      if (err) {
        console.log('crossChain_updateCcTokensInfo: ', err)
        return;
      }
      self.ccTokensList[addr][key] = value;
    })
  }

  @action addWrc20Tokens(scInfo) {
    const { addr } = scInfo;
    if (addr) {
      self.wrc20List.addr = { ...scInfo };
    }
  }

  @computed get getTokenList() {
    let list = [];
    if (!(self.tokensList instanceof Object)) {
      return [];
    }
    Object.keys(self.tokensList).forEach(item => {
      let val = self.tokensList[item];
      list.push({
        addr: item,
        chain: val.chain,
        symbol: val.symbol,
        decimals: val.decimals,
        buddy: val.buddy,
        select: val.select
      })
    })
    return list.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  @computed get ccTokens() {
    let excludedList = CROSSCHAINTYPE;
    let list = [];
    if (!(self.ccTokensList instanceof Object)) {
      return [];
    }
    Object.keys(self.ccTokensList).forEach(item => {
      try {
        let val = self.ccTokensList[item];
        if (!excludedList.includes(item)) {
          list.push({
            addr: item,
            chain: val.chain,
            symbol: val.symbol,
            decimals: val.decimals,
            select: val.select
          })
        }
      } catch (err) {
        console.log(`Get cross chain ${item} failed`, err);
      }
    })
    return list.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  @computed get ccTokensSiderbar() {
    let list = [];
    if (!(self.ccTokensList instanceof Object)) {
      return [];
    }
    Object.keys(self.ccTokensList).forEach(item => {
      try {
        let val = self.ccTokensList[item];
        if (!CROSSCHAINTYPE.includes(item)) {
          list.push({
            tokenAddr: val.wan_addr,
            tokenOrigAddr: val.chain === 'EOS' ? wand.ccUtil.encodeAccount('EOS', item) : item,
            chain: val.chain,
            symbol: val.symbol,
            decimals: val.decimals,
            select: val.select
          })
        }
      } catch (err) {
        console.log(`Get cross chain ${item} failed`, err);
      }
    })
    return list.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  @computed get tokensOnSideBar() {
    let list = [];
    if (!(self.tokensList instanceof Object)) {
      return [];
    }
    Object.keys(self.tokensList).forEach(item => {
      let val = self.tokensList[item];
      if (val.select) {
        list.push({
          chain: val.chain,
          tokenAddr: item,
          symbol: val.symbol,
          buddy: val.buddy,
          decimals: val.decimals,
        })
      }
    });
    return list.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  @computed get getTokensListInfo() {
    let addrList = [];
    let normalArr = Object.keys(wanAddress.addrInfo.normal);
    normalArr.forEach(item => {
      let balance;
      if (self.tokensBalance && self.tokensBalance[self.currTokenAddr]) {
        if (self.tokensList && self.tokensList[self.currTokenAddr]) {
          balance = formatNumByDecimals(self.tokensBalance[self.currTokenAddr][item], self.tokensList[self.currTokenAddr].decimals)
        } else {
          balance = 0
        }
      } else {
        balance = 0;
      }
      addrList.push({
        key: item,
        name: wanAddress.addrInfo.normal[item].name,
        address: wanUtil.toChecksumAddress(item),
        balance: formatNum(balance),
        path: `${WANPATH}${wanAddress.addrInfo.normal[item].path}`,
        action: 'send',
        amount: balance
      });
    });
    return addrList;
  }

  @computed get getTokensListInfo_2WanTypes() {
    let addTypes = ['normal', 'ledger', 'trezor', 'import', 'rawKey'];
    let addrList = [];

    Object.keys(wanAddress.addrInfo).forEach(type => {
      if (!addTypes.includes(type)) {
        return;
      }

      Object.keys(wanAddress.addrInfo[type]).forEach(item => {
        let balance;

        if (self.tokensBalance && self.tokensBalance[self.currTokenAddr]) {
          if (self.tokensList && self.tokensList[self.currTokenAddr]) {
            balance = formatNumByDecimals(self.tokensBalance[self.currTokenAddr][item], self.tokensList[self.currTokenAddr].decimals)
          } else {
            balance = 0
          }
        } else {
          balance = 0;
        }
        let path = ['ledger', 'trezor'].includes(type) ? `${wanAddress.addrInfo[type][item].path}` : `${WANPATH}${wanAddress.addrInfo[type][item].path}`;
        addrList.push({
          path,
          key: item,
          name: wanAddress.addrInfo[type][item].name,
          address: wanUtil.toChecksumAddress(item),
          balance: balance,
          action: 'send',
          amount: balance
        });
      })
    })

    return addrList;
  }

  @computed get getE20TokensListInfo() {
    let addrList = [];
    let normalArr = Object.keys(ethAddress.addrInfo.normal);
    normalArr.forEach(item => {
      let balance;
      if (self.formatTokensList && self.formatTokensList[self.currTokenAddr]) {
        let tokenOrigAddr = self.formatTokensList[self.currTokenAddr].tokenOrigAddr;
        if (self.E20TokensBalance && self.E20TokensBalance[tokenOrigAddr]) {
          balance = formatNumByDecimals(self.E20TokensBalance[tokenOrigAddr][item], self.formatTokensList[self.currTokenAddr].decimals)
        } else {
          balance = 0
        }
      } else {
        balance = 0;
      }
      addrList.push({
        key: item,
        name: ethAddress.addrInfo.normal[item].name,
        address: item,
        balance: formatNum(balance),
        path: `${ETHPATH}${ethAddress.addrInfo.normal[item].path}`,
        action: 'send',
        amount: balance
      });
    });
    return addrList;
  }

  @computed get getE20TokensInfo() {
    let addrList = [];
    let normal = ethAddress.addrInfo.normal;
    let rawKey = ethAddress.addrInfo.rawKey;
    [normal, rawKey].forEach(obj => {
      Object.keys(obj).forEach(item => {
        let balance;
        if (self.E20TokensBalance && self.E20TokensBalance[self.currTokenAddr]) {
          balance = formatNumByDecimals(self.E20TokensBalance[self.currTokenAddr][item], self.tokensList[self.currTokenAddr].decimals)
        } else {
          balance = 0
        }
        addrList.push({
          key: item,
          name: obj[item].name,
          address: item,
          balance: formatNum(balance),
          path: `${ETHPATH}${obj[item].path}`,
          action: 'send',
          amount: balance
        });
      });
    });
    return addrList;
  }

  @computed get getTokenAmount() {
    let amount = new BigNumber(0);
    let importArr = Object.keys(wanAddress.addrInfo.import);
    let ledgerArr = Object.keys(wanAddress.addrInfo.ledger);
    let trezorArr = Object.keys(wanAddress.addrInfo.trezor);
    let rawKeyArr = Object.keys(wanAddress.addrInfo.rawKey);

    self.getTokensListInfo.forEach(item => {
      amount = amount.plus(item.amount);
    });
    importArr.concat(ledgerArr, trezorArr, rawKeyArr).forEach(item => {
      let balance;
      if (self.tokensBalance && self.tokensBalance[self.currTokenAddr]) {
        if (self.tokensList && self.tokensList[self.currTokenAddr]) {
          balance = formatNumByDecimals(self.tokensBalance[self.currTokenAddr][item], self.tokensList[self.currTokenAddr].decimals)
        } else {
          balance = 0
        }
      } else {
        balance = 0;
      }

      amount = amount.plus(balance);
    })
    return formatNum(amount.toString(10));
  }

  @computed get getE20TokenAmount() {
    let amount = new BigNumber(0);

    self.getE20TokensInfo.forEach(item => {
      amount = amount.plus(item.amount);
    });

    return formatNum(amount.toString(10));
  }
}

const self = new Tokens();
export default self;
