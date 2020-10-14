import BigNumber from 'bignumber.js';
import intl from 'react-intl-universal';
import React, { Component } from 'react';
import { observer, inject } from 'mobx-react';
import { Button, Modal, Form, Icon, message, Spin } from 'antd';

import './index.less';
import { WALLETID } from 'utils/settings';
import PwdForm from 'componentUtils/PwdForm';
import { wandWrapper, fromWei } from 'utils/support.js';
import StoremanConfirmForm from './StoremanConfirmForm';
import { signTransaction } from 'componentUtils/trezor';
import CommonFormItem from 'componentUtils/CommonFormItem';
import style from 'components/Staking/MyValidatorsList/index.less';
import { checkAmountUnit, getValueByAddrInfo } from 'utils/helper';

const ACTION = 'stakeClaim';
const pu = require('promisefy-util');
const Confirm = Form.create({ name: 'StoremanConfirmForm' })(StoremanConfirmForm);

@inject(stores => ({
  settings: stores.session.settings,
  addrInfo: stores.wanAddress.addrInfo,
  updateStakeInfo: () => stores.staking.updateStakeInfo(),
  updateTransHistory: () => stores.wanAddress.updateTransHistory(),
}))

@observer
class InForm extends Component {
  state = {
    gasPrice: '0',
    gasLimit: '0',
    confirmVisible: false,
    confirmLoading: false,
    fee: this.props.txParams.fee,
  };

  componentDidUpdate(prevProps) {
    if (this.props.txParams.fee !== '0' && prevProps.txParams.fee === '0') {
      this.setState({
        fee: this.props.txParams.fee,
        gasLimit: this.props.txParams.gasLimit,
        gasPrice: this.props.txParams.gasPrice
      })
    }
  }

  componentWillUnmount () {
    this.setState = (state, callback) => {
      return false;
    };
  }

  checkAmount = (rule, value, callback) => {
    let { form } = this.props;
    let balance = form.getFieldValue('balance');
    if (value === undefined || !checkAmountUnit(18, value)) {
      callback(intl.get('Common.invalidAmount'));
      return;
    }
    if (new BigNumber(value).lt(0)) {
      callback(intl.get('StakeInForm.stakeTooLow'));
      return;
    }
    if (new BigNumber(value).minus(balance).gte(0)) {
      callback(intl.get('SendNormalTrans.hasBalance'));
      return;
    }
    callback();
  }

  showConfirmForm = () => {
    let { form, settings } = this.props;
    form.validateFields(err => {
      if (err) return;
      if (new BigNumber(form.getFieldValue('balance')).lt(this.state.fee)) {
        message.warn(intl.get('NormalTransForm.overBalance'));
        return;
      }

      let pwd = form.getFieldValue('pwd');
      if (!settings.reinput_pwd) {
        this.setState({ confirmVisible: true });
      } else {
        wand.request('phrase_checkPwd', { pwd }, err => {
          if (err) {
            message.warn(intl.get('Backup.invalidPassword'));
          } else {
            this.setState({ confirmVisible: true });
          }
        })
      }
    })
  }

  onSend = async () => {
    this.setState({ confirmLoading: true });
    let { record } = this.props;
    let { path, addr: from, walletID } = record.myAddress;
    let tx = {
      from,
      amount: '0',
      walletID,
      wkAddr: record.wkAddr,
      BIP44Path: record.myAddress.path,
      gasLimit: this.state.gasLimit,
      withdrawValue: record.unclaimedData,
      canStakeClaim: record.canStakeClaim
    };

    if (WALLETID.TREZOR === walletID) {
      let satellite = { wkAddr: record.wkAddr, annotate: 'Storeman-stakeClaim', withdrawValue: record.unclaimedData };
      try {
        await this.trezorTrans(path, from, satellite);
      } catch (err) {
        message.warn(intl.get('WanAccount.sendTransactionFailed'));
        console.log(`trezorTrans Error: ${err}`)
      }
      message.success(intl.get('WanAccount.sendTransactionSuccessFully'));
      this.setState({ confirmVisible: false });
      this.props.onSend(walletID);
    } else {
      if (walletID === WALLETID.LEDGER) {
        message.info(intl.get('Ledger.signTransactionInLedger'))
      }
      wand.request('storeman_openStoremanAction', { tx, action: 'stakeClaim' }, (err, ret) => {
        if (err) {
          message.warn(intl.get('WanAccount.sendTransactionFailed'));
        } else {
          message.success(intl.get('WanAccount.sendTransactionSuccessFully'));
          console.log('validatorIn ret:', ret);
        }
        this.props.updateTransHistory();
        this.setState({ confirmVisible: false });
        this.props.onSend();
      });
    }
  }

  trezorTrans = async (BIP44Path, from, satellite) => {
    try {
      let tx = {
        amount: '0',
        BIP44Path,
        walletID: WALLETID.TREZOR,
        wkAddr: this.props.record.wkAddr,
        withdrawValue: this.props.record.unclaimedData,
        canStakeClaim: this.props.record.canStakeClaim,
        from: from.indexOf(':') === -1 ? from : from.split(':')[1].trim(),
      }
      let { result: estimateData } = await wandWrapper('storeman_openStoremanAction', { tx, action: ACTION, isEstimateFee: false });
      let rawTx = {
        from,
        chainId: Number(estimateData.chainId),
        Txtype: 1,
        to: estimateData.to,
        value: estimateData.value,
        data: estimateData.data,
        nonce: '0x' + estimateData.nonce.toString(16),
        gasPrice: '0x' + Number(estimateData.gasPrice).toString(16),
        gasLimit: '0x' + Number(estimateData.gasLimit).toString(16),
      };
      let raw = await pu.promisefy(signTransaction, [BIP44Path, rawTx], this);// Trezor sign

      // Send register validator
      let txHash = await pu.promisefy(wand.request, ['transaction_raw', { raw, chainType: 'WAN' }], this);
      let params = {
        txHash,
        from: from.toLowerCase(),
        to: rawTx.to,
        value: rawTx.value,
        gasPrice: rawTx.gasPrice,
        gasLimit: rawTx.gasLimit,
        nonce: rawTx.nonce,
        srcSCAddrKey: 'WAN',
        srcChainType: 'WAN',
        tokenSymbol: 'WAN',
        status: 'Sent',
      };
      // save register validator history into DB
      await pu.promisefy(wand.request, ['storeman_insertStoremanTransToDB', { tx: params, satellite }], this);
      this.props.updateStakeInfo();
      this.props.updateTransHistory();
    } catch (error) {
      console.log('Trezor validator append failed:', error);
      message.warn(intl.get('WanAccount.sendTransactionFailed'));
    }
  }

  onConfirmCancel = () => {
    this.setState({ confirmVisible: false, confirmLoading: false });
  }

  render () {
    const { onCancel, form, settings, record, addrInfo, spin } = this.props;
    let balance = getValueByAddrInfo(record.myAddress.addr, 'balance', addrInfo);
    let showConfirmItem = { storeman: true, withdrawable: true, account: true };

    return (
      <div>
        <Modal visible closable={false} destroyOnClose={true} title={intl.get('TransHistory.Storeman-stakeClaim')} className="validator-register-modal + spincont"
        footer={[
            <Button key="back" className="cancel" onClick={onCancel}>{intl.get('Common.cancel')}</Button>,
            <Button disabled={record.unclaimedData === '0' || spin} key="submit" type="primary" onClick={this.showConfirmForm}>{intl.get('Common.next')}</Button>,
          ]}
        >
          <Spin spinning={spin} size="large">
            <div className="validator-bg">
              <div className="stakein-title">{intl.get('Storeman.storemanAccount')}</div>
              <CommonFormItem form={form} formName='crosschain' disabled={true}
                options={{ initialValue: record.crosschain, rules: [{ required: true }] }}
                title={intl.get('Common.crossChain')}
              />
              <CommonFormItem form={form} formName='stake' disabled={true}
                options={{ initialValue: record.stake, rules: [{ required: true }] }}
                title={intl.get('staking.myStake')}
              />
              <CommonFormItem form={form} formName='reward' disabled={true}
                options={{ initialValue: record.reward, rules: [{ required: true }] }}
                title={intl.get('staking.totalReward')}
              />
              <CommonFormItem form={form} formName='account' disabled={true}
                options={{ initialValue: record.wkAddr, rules: [{ required: true }] }}
                title={intl.get('Common.storeman')}
              />
              <CommonFormItem form={form} formName='withdrawableAmount' disabled={true}
                options={{ initialValue: record.unclaimedData, rules: [{ required: true }] }}
                title={intl.get('staking.unclaimAmount')}
              />
            </div>
            <div className="validator-bg">
              <div className="stakein-title">{intl.get('ValidatorRegister.myAccount')}</div>
              <CommonFormItem form={form} formName='myAccount' disabled={true}
                options={{ initialValue: record.account }}
                prefix={<Icon type="credit-card" className="colorInput" />}
                title={intl.get('ValidatorRegister.address')}
              />
              <CommonFormItem form={form} formName='balance' disabled={true}
                options={{ initialValue: balance }}
                prefix={<Icon type="credit-card" className="colorInput" />}
                title={intl.get('ValidatorRegister.balance')}
              />
              <CommonFormItem form={form} formName='fee' disabled={true}
                options={{ initialValue: this.state.fee + ' WAN' }}
                prefix={<Icon type="credit-card" className="colorInput" />}
                title={intl.get('CrossChainTransForm.estimateFee')}
              />
              { settings.reinput_pwd && <PwdForm form={form}/> }
            </div>
          </Spin>
        </Modal>
        { this.state.confirmVisible && <Confirm confirmLoading={this.state.confirmLoading} showConfirmItem={showConfirmItem} onCancel={this.onConfirmCancel} onSend={this.onSend} record={record} title={intl.get('NormalTransForm.ConfirmForm.transactionConfirm')} /> }
      </div>
    );
  }
}

const StoremanInForm = Form.create({ name: 'InForm' })(InForm);
class OsmClaim extends Component {
  state = {
    visible: false,
    txParams: {
      fee: '0',
      gasPrice: '0',
      gasLimit: '0',
    },
    spin: true,
  }

  handleStateToggle = () => {
    let { record } = this.props;
    this.setState(state => ({ visible: !state.visible }));
    let { path, addr, walletID } = record.myAddress;
    let tx = {
      walletID,
      from: addr,
      amount: '0',
      BIP44Path: path,
      wkAddr: record.wkAddr,
    };
    wand.request('storeman_openStoremanAction', { tx, action: ACTION, isEstimateFee: false }, (err, ret) => {
      if (err) {
        message.warn(intl.get('NormalTransForm.estimateGasFailed'));
      } else {
        let data = ret.result;
        this.setState({
          spin: false,
          txParams: {
            gasPrice: data.gasPrice,
            gasLimit: data.estimateGas,
            fee: fromWei(new BigNumber(data.gasPrice).multipliedBy(data.estimateGas).toString(10))
          }
        })
      }
    });
  }

  handleSend = () => {
    this.setState({ visible: false });
  }

  render () {
    const { record } = this.props;
    return (
      <div>
        <Button className={style.modifyTopUpBtn} onClick={this.handleStateToggle} />
        {
          this.state.visible &&
          <StoremanInForm spin={this.state.spin} txParams={this.state.txParams} onCancel={this.handleSend} onSend={this.handleSend} record={record} />
        }
      </div>
    );
  }
}

export default OsmClaim;
