import intl from 'react-intl-universal';
import React, { Component } from 'react';
import { BigNumber } from 'bignumber.js';
import { observer, inject } from 'mobx-react';
import { Table, Row, Col, message } from 'antd';

import style from './index.less';
import TransHistory from 'components/TransHistory';
import CopyAndQrcode from 'components/CopyAndQrcode';
import SendTokenNormalTrans from 'components/SendNormalTrans/SendTokenNormalTrans';
import { WanTx, WanRawTx } from 'utils/hardwareUtils'
import { checkAddrType, getWalletIdByType } from 'utils/helper';
import { WALLETID, TRANSTYPE, MAIN, TESTNET } from 'utils/settings';
import { signTransaction } from 'componentUtils/trezor'

message.config({
  duration: 2,
  maxCount: 1
});

@inject(stores => ({
  chainId: stores.session.chainId,
  language: stores.languageIntl.language,
  getAmount: stores.tokens.getTokenAmount,
  currTokenAddr: stores.tokens.currTokenAddr,
  transParams: stores.sendTransParams.transParams,
  tokenIconList: stores.tokens.tokenIconList,
  getTokensListInfo_ByChain: stores.tokens.getTokensListInfo_ByChain,
  setCurrToken: addr => stores.tokens.setCurrToken(addr),
  setCurrTokenChain: chain => stores.tokens.setCurrTokenChain(chain),
  getTokenIcon: (tokenScAddr) => stores.tokens.getTokenIcon(tokenScAddr),
  updateTransHistory: () => stores.wanAddress.updateTransHistory(),
  changeTitle: newTitle => stores.languageIntl.changeTitle(newTitle),
  updateTokensBalance: (...args) => stores.tokens.updateTokensBalance(...args),
  getChainAddressInfoByChain: chain => stores.tokens.getChainAddressInfoByChain(chain),
}))

@observer
class TokenTrans extends Component {
  constructor(props) {
    super(props);
    this.props.changeTitle('WanAccount.wallet');
    this.init(props.tokenAddr, props.chain);
  }

  init = (tokenAddr, chain) => {
    this.props.setCurrToken(tokenAddr);
    this.props.setCurrTokenChain(chain);
    this.props.updateTransHistory();
    if (!this.props.tokenIconList[tokenAddr]) {
      this.props.getTokenIcon(tokenAddr);
    }
  }

  componentDidMount() {
    const { tokenAddr, chain } = this.props;
    this.props.updateTransHistory();
    this.props.updateTokensBalance(tokenAddr, chain);
    this.timer = setInterval(() => {
      this.props.updateTransHistory();
      this.props.updateTokensBalance(tokenAddr, chain);
    }, 5000);
  }

  componentWillUnmount() {
    clearInterval(this.timer);
  }

  componentWillReceiveProps(newProps) {
    let addr = newProps.match.params.tokenAddr;
    let chain = newProps.match.params.chain;
    if (addr !== this.props.currTokenAddr) {
      // console.log('Do Init!!!', addr, chain, this.props.currTokenAddr)
      this.init(addr, chain);
    }
  }

  sendLedgerTrans = (path, tx) => {
    message.info(intl.get('Ledger.signTransactionInLedger'));
    let rawTx = {
      to: tx.to,
      value: 0,
      data: tx.data,
      chainId: this.props.chainId,
      nonce: '0x' + tx.nonce.toString(16),
      gasLimit: tx.gasLimit,
      gasPrice: '0x' + new BigNumber(tx.gasPrice).times(BigNumber(10).pow(9)).toString(16),
      Txtype: 1
    }
    return new Promise((resolve, reject) => {
      wand.request('wallet_signTransaction', { walletID: WALLETID.LEDGER, path, rawTx: new WanRawTx(rawTx).serialize() }, (err, sig) => {
        if (err) {
          message.warn(intl.get('Ledger.signTransactionFailed'));
          reject(err);
          console.log(`signLedgerTransaction: ${err}`);
        } else {
          console.log('Signature: ', sig)
          rawTx.v = sig.v;
          rawTx.r = sig.r;
          rawTx.s = sig.s;
          resolve('0x' + new WanTx(rawTx).serialize().toString('hex'));
        }
      });
    })
  }

  columns = [
    {
      dataIndex: 'name',
      editable: true
    },
    {
      dataIndex: 'address',
      render: text => <div className="addrText"><p className="address">{text}</p><CopyAndQrcode addr={text} /></div>
    },
    {
      dataIndex: 'balance',
      sorter: (a, b) => a.balance - b.balance,
    },
    {
      dataIndex: 'action',
      render: (text, record) => {
        // console.log('record:', record);
        return <div><SendTokenNormalTrans balance={typeof (record.balance) === 'string' ? record.balance.replace(/,/g, '') : record.balance} tokenAddr={this.props.tokenAddr} from={record.address} path={record.path} handleSend={this.handleSend} chainType={this.props.chain} transType={TRANSTYPE.tokenTransfer} /></div>
      }
    }
  ];

  handleSend = from => {
    let params = this.props.transParams[from];
    // console.log('params:', params);
    const { chain, symbol, getChainAddressInfoByChain } = this.props;
    let addrInfo = getChainAddressInfoByChain(chain);
    if (addrInfo === undefined) {
      message.warn(intl.get('Unknown token type')); // To do : i18n
      return;
    }

    let type = checkAddrType(from, addrInfo);
    let walletID = getWalletIdByType(type);
    let trans = {
      walletID,
      chainType: chain,
      symbol: symbol,
      path: params.path,
      to: params.to,
      // amount: '0',
      amount: params.token,
      gasLimit: `0x${params.gasLimit.toString(16)}`,
      gasPrice: params.gasPrice,
      nonce: params.nonce,
      data: params.data,
      satellite: {
        transferTo: params.transferTo.toLowerCase(),
        token: params.token
      }
    };
    // console.log('trans:', trans);
    return new Promise((resolve, reject) => {
      switch (type) {
        case 'ledger':
          this.sendLedgerTrans(params.path, trans).then(raw => {
            wand.request('transaction_raw', { raw, chainType: 'WAN' }, (err, txHash) => {
              if (err) {
                message.warn(intl.get('HwWallet.Accounts.sendTransactionFailed'));
                reject(false); // eslint-disable-line prefer-promise-reject-errors
              } else {
                wand.request('transaction_insertTransToDB', {
                  rawTx: {
                    txHash,
                    value: trans.amount,
                    from: from.toLowerCase(),
                    srcSCAddrKey: 'WAN',
                    srcChainType: 'WAN',
                    tokenSymbol: 'WAN',
                    ...trans
                  },
                  satellite: trans.satellite
                }, () => {
                  this.props.updateTransHistory();
                })
                console.log('TxHash:', txHash);
                resolve(txHash);
              }
            });
          }).catch(() => { reject(false) }); // eslint-disable-line prefer-promise-reject-errors
          break;
        case 'trezor':
          signTransaction(params.path, {
            Txtype: 1,
            value: '0x',
            chainId: this.props.chainId,
            to: trans.to,
            data: trans.data,
            nonce: '0x' + trans.nonce.toString(16),
            gasLimit: trans.gasLimit,
            gasPrice: '0x' + new BigNumber(trans.gasPrice).times(BigNumber(10).pow(9)).toString(16),
          }, (_err, raw) => {
            if (_err) {
              console.log('signTrezorTransaction:', _err)
              return;
            }
            wand.request('transaction_raw', { raw, chainType: 'WAN' }, (err, txHash) => {
              if (err) {
                message.warn(intl.get('HwWallet.Accounts.sendTransactionFailed'));
                reject(err);
              } else {
                wand.request('transaction_insertTransToDB', {
                  rawTx: {
                    txHash,
                    value: trans.amount,
                    from: from.toLowerCase(),
                    srcSCAddrKey: 'WAN',
                    srcChainType: 'WAN',
                    tokenSymbol: 'WAN',
                    ...trans
                  },
                  satellite: trans.satellite
                }, () => {
                  this.props.updateTransHistory();
                })
                resolve(txHash);
              }
            });
          });
          break;
        case 'normal':
        case 'import':
        case 'rawKey':
          wand.request('transaction_tokenNormal', trans, (err, txHash) => {
            if (err) {
              message.warn(intl.get('WanAccount.sendTransactionFailed'));
              console.log('transaction_normal:', err);
              reject(false); // eslint-disable-line prefer-promise-reject-errors
            } else {
              this.props.updateTransHistory();
              console.log('Tx hash: ', txHash);
              resolve(txHash)
            }
          });
          break;
      }
    })
  }

  onClickRow = () => {
    let { chainId, tokenAddr } = this.props;
    let href = chainId === 1 ? `${MAIN}/token/${tokenAddr}` : `${TESTNET}/token/${tokenAddr}`
    wand.shell.openExternal(href);
  }

  render() {
    const { getAmount, getTokensListInfo_ByChain, symbol, tokenAddr, chain } = this.props;

    this.props.language && this.columns.forEach(col => {
      col.title = intl.get(`WanAccount.${col.dataIndex}`)
    });

    // console.log('params:', tokenAddr, chain, symbol);

    return (
      <div className="account">
        <Row className="title">
          <Col span={12} className="col-left"><img className="totalImg" src={this.props.tokenIconList[this.props.tokenAddr]} /><span className="wanTotal">{getAmount}</span><span className="wanTex">{symbol}</span></Col>
          <Col span={12} className="col-right">
            <span className={style.tokenTxt}>{intl.get('Common.tokenAddr')}: <span className={style.tokenAddr} onClick={this.onClickRow}>{tokenAddr}</span></span>
          </Col>
        </Row>
        <Row className="mainBody">
          <Col>
            <Table className="content-wrap" pagination={false} columns={this.columns} dataSource={getTokensListInfo_ByChain} />
          </Col>
        </Row>
        <Row className="mainBody">
          <Col>
            <TransHistory name={['normal', 'import', 'ledger', 'trezor', 'rawKey']} transType={TRANSTYPE.tokenTransfer} />
          </Col>
        </Row>
      </div>
    );
  }
}

export default props => <TokenTrans {...props} symbol={props.match.params.symbol} chain={props.match.params.chain} key={props.match.params.tokenAddr} tokenAddr={props.match.params.tokenAddr} />;
