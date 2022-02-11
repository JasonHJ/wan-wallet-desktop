import intl from 'react-intl-universal';
import { BigNumber } from 'bignumber.js';
import React, { useState, useContext, useMemo, useEffect } from 'react';
import { observer, MobXProviderContext } from 'mobx-react';
import { Button, Modal, Form, Icon, message, Spin, Checkbox, Tooltip } from 'antd';

import style from './index.less';
import useAsync from 'hooks/useAsync';
import PwdForm from 'componentUtils/PwdForm';
import SelectForm from 'componentUtils/SelectForm';
import CommonFormItem from 'componentUtils/CommonFormItem';
import AutoCompleteForm from 'componentUtils/AutoCompleteForm';
import outboundOptionForm from 'components/AdvancedCrossChainOptionForm';
import ConfirmForm from 'components/CrossChain/CrossChainTransForm/ConfirmForm/CrossXRPConfirmForm';
import { WANPATH, INBOUND, XRPPATH, OUTBOUND, MINXRPBALANCE, ETHPATH, WALLETID } from 'utils/settings';
import { formatNumByDecimals, hexCharCodeToStr, isExceedBalance, formatNum, fromWei } from 'utils/support';
import { getFullChainName, getStoremanAddrByGpk1, getValueByAddrInfo, checkAmountUnit, getValueByNameInfo, getBalance, getInfoByAddress, getValueByNameInfoAllType } from 'utils/helper';

const pu = require('promisefy-util');
const Confirm = Form.create({ name: 'CrossXRPConfirmForm' })(ConfirmForm);
const AdvancedOutboundOptionForm = Form.create({ name: 'AdvancedXRPCrossChainOptionForm' })(outboundOptionForm);

const CrossXRPForm = observer(({ form, toggleVisible, onSend }) => {
  const { languageIntl, crossChain, tokens, session: { settings }, portfolio: { coinPriceObj }, sendCrossChainParams: { record, updateXRPTransParams, XRPCrossTransParams } } = useContext(MobXProviderContext)
  const { toChainSymbol, fromTokenSymbol, fromChainName, toTokenSymbol, toChainName, fromChainSymbol, ancestorDecimals, fromChainID, toChainID } = crossChain.currentTokenPairInfo
  const { type, name, balance, address } = record;
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState('0');
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [sendAll, setSendAll] = useState(false);
  const [handleNextStatus, setHandleNextStatus] = useState(false);

  const { status: fetchGroupListStatus, value: smgList } = useAsync('storeman_getReadyOpenStoremanGroupList', [], true);
  const { status: fetchNetworkFeeStatus, value: networkFee } = useAsync('crossChain_getCrossChainFees', '0', true, { chainType: type === INBOUND ? 'XRP' : toChainSymbol, chainIds: [fromChainID, toChainID] });
  const { status: fetchQuotaStatus, value: quotaList, execute: executeGetQuota } = useAsync('crossChain_getQuota', [{}], false);
  const { status: fetchFeeStatus, value: estimatedFee, execute: executeEstimatedFee } = useAsync('crossChain_estimatedXrpFee', '0', false);
  const { status: fetchGasPrice, value: gasPrice } = useAsync('query_getGasPrice', '0', type === OUTBOUND, { chainType: toChainSymbol });

  const info = type === INBOUND ? {
    feeSymbol: fromChainSymbol,
    desChain: toChainSymbol,
    toAccountList: tokens.getChainAddressInfoByChain(toChainSymbol),
    title: `${fromTokenSymbol}@${fromChainName} -> ${toTokenSymbol}@${toChainName}`,
    unit: fromTokenSymbol,
    feeUnit: fromChainSymbol,
    toUnit: toTokenSymbol
  } : {
    feeSymbol: toChainSymbol,
    desChain: fromChainSymbol,
    toAccountList: tokens.getChainAddressInfoByChain(fromChainSymbol),
    title: `${toTokenSymbol}@${toChainName} -> ${fromTokenSymbol}@${fromChainName}`,
    unit: toTokenSymbol,
    feeUnit: toChainSymbol,
    toUnit: fromTokenSymbol
  }

  const spin = useMemo(() => {
    return [fetchGroupListStatus, fetchQuotaStatus, fetchNetworkFeeStatus, fetchGasPrice, fetchFeeStatus].includes('pending') || handleNextStatus;
  }, [fetchGroupListStatus, fetchQuotaStatus, fetchNetworkFeeStatus, fetchGasPrice, fetchFeeStatus, handleNextStatus])

  const maxQuota = useMemo(() => {
    return formatNumByDecimals(quotaList[0].maxQuota, ancestorDecimals)
  }, [quotaList])

  const minQuota = useMemo(() => {
    return formatNumByDecimals(quotaList[0].minQuota, ancestorDecimals)
  }, [quotaList])

  const fee = useMemo(() => {
    let tmp;
    if (type === INBOUND) {
      tmp = estimatedFee;
    } else {
      tmp = new BigNumber(gasPrice).div(BigNumber(10).pow(9)).times(XRPCrossTransParams.gasLimit).div(BigNumber(10).pow(9)).toString(10);
    }
    return tmp;
  }, [estimatedFee, gasPrice, XRPCrossTransParams.gasLimit])

  const totalFeeInUSD = useMemo(() => {
    let symbol = type === INBOUND ? fromChainSymbol : toChainSymbol;
    if ((typeof coinPriceObj === 'object') && symbol in coinPriceObj) {
      return `${new BigNumber(fee).times(coinPriceObj[symbol]).toString(10)} USD`;
    } else {
      return `${fee} ${symbol}`;
    }
  }, [fee, coinPriceObj]);

  const userNetWorkFee = useMemo(() => {
    return `${fee} ${info.feeSymbol}`
  }, [fee])

  const crosschainNetWorkFee = useMemo(() => {
    return `${formatNumByDecimals(networkFee.lockFee, ancestorDecimals)} ${info.unit}`
  }, [networkFee])

  useEffect(() => {
    if (form.getFieldValue('amount')) {
      form.validateFields(['amount'], { force: true })
    }
  }, [quotaList])

  useEffect(() => {
    updateXRPTransParams({ gasPrice: fromWei(gasPrice, 'gwei') })
  }, [gasPrice])

  useEffect(() => {
    let groupId = smgList[0] ? smgList[0].groupId : '0x';
    if (groupId === '0x') return;
    executeGetQuota({ chainType: info.feeUnit, groupId, symbolArray: 'XRP', options: { targetChainType: info.desChain } })
    updateXRPTransParams({ groupAddr: getStoremanAddrByGpk1(smgList[0][`gpk${Number(smgList[0].curve2 === '0') + 1}`]), groupId: smgList[0].groupId, groupName: hexCharCodeToStr(smgList[0].groupId) })
  }, [smgList])

  useEffect(() => {
    if (fetchFeeStatus === 'success') {
      let value = form.getFieldValue('amount');
      setReceivedAmount(new BigNumber(value).minus(formatNumByDecimals(networkFee.lockFee, ancestorDecimals)).toString(10))
    }
  }, [fetchFeeStatus])

  useEffect(() => {
    if (fetchGroupListStatus === 'error') {
      // TODO: CHANGE WARNING MESSAGE
      message.warn(intl.get('network.down'));
    }
    if (fetchQuotaStatus === 'error') {
      message.warn(intl.get('CrossChainTransForm.getQuotaFailed'));
    }
    // TODO: CHANGE WARNING MESSAGE
    if (fetchFeeStatus === 'error') {
      message.warn(intl.get('network.down'));
    }
    if (fetchGasPrice === 'error') {
      message.warn(intl.get('network.down'));
    }
  }, [fetchGroupListStatus, fetchQuotaStatus, fetchFeeStatus, fetchGasPrice])

  const addressSelections = Object.keys({ ...info.toAccountList.normal, ...info.toAccountList.ledger, ...info.toAccountList.trezor });
  const accountSelections = addressSelections.map(val => getValueByAddrInfo(val, 'name', info.toAccountList));

  const checkXRPBalance = (addr, type) => {
    return type === OUTBOUND ? getBalance([addr], 'XRP').then(val => new BigNumber(val[addr]).plus(receivedAmount).gte('11')).catch(() => false) : Promise.resolve(true)
  }

  const handleNext = () => {
    setHandleNextStatus(true)
    form.validateFields(err => {
      if (err) {
        console.log('handleNext', err);
        setHandleNextStatus(false)
        return;
      };
      const { pwd, amount } = form.getFieldsValue(['pwd', 'amount']);
      const isNativeAddress = addressSelections.includes(form.getFieldValue('to'));
      const isNativeAccount = accountSelections.includes(form.getFieldValue('to'));
      const desPath = info.desChain === 'WAN' ? WANPATH : ETHPATH;
      const toPathPrefix = type === INBOUND ? desPath : XRPPATH;
      let to, toAddr, walletID;
      let addrType = 'normal';
      let toValue = form.getFieldValue('to')
      if (isNativeAddress || isNativeAccount) {
        if (isNativeAccount) {
          addrType = getValueByNameInfoAllType(toValue, 'type', info.toAccountList);
          walletID = addrType === 'normal' ? 1 : WALLETID[addrType.toUpperCase()]
          to = addrType !== 'trezor'
                                    ? { walletID, path: addrType === 'normal' ? `${toPathPrefix}${getValueByNameInfo(toValue, 'path', info.toAccountList)}` : info.toAccountList[addrType][getValueByNameInfoAllType(toValue, 'address', info.toAccountList)].path }
                                    : getValueByNameInfoAllType(toValue, 'address', info.toAccountList)
          toAddr = getValueByNameInfoAllType(toValue, 'address', info.toAccountList);
        } else {
          addrType = getInfoByAddress(to, [], info.toAccountList).type
          walletID = addrType === 'normal' ? 1 : WALLETID[addrType.toUpperCase()]
          to = addrType !== 'trezor'
                                    ? { walletID, path: addrType === 'normal' ? `${toPathPrefix}${(getInfoByAddress(toValue, ['path'], info.toAccountList)).path}` : info.toAccountList[addrType][toValue].path }
                                    : toValue
          toAddr = toValue;
        }
      } else {
        to = toAddr = toValue;
      }
      const params = { value: amount, to, toAddr, networkFee: networkFee.lockFee, receivedAmount }
      if (settings.reinput_pwd) {
        if (!pwd) {
          message.warn(intl.get('Backup.invalidPassword'));
          return;
        }
        wand.request('phrase_checkPwd', { pwd }, err => {
          if (err) {
            message.warn(intl.get('Backup.invalidPassword'));
          } else {
            checkXRPBalance(toAddr, type).then(ret => {
              setHandleNextStatus(false)
              if (ret) {
                updateXRPTransParams(params);
                setConfirmVisible(true);
              } else {
                message.warn(intl.get('Xrp.notExistAccount'))
              }
            })
          }
        })
      } else {
        checkXRPBalance(toAddr, type).then(ret => {
          setHandleNextStatus(false)
          if (ret) {
            updateXRPTransParams(params);
            setConfirmVisible(true);
          } else {
            message.warn(intl.get('Xrp.notExistAccount'))
          }
        })
      }
    });
  }

  const updateLockAccounts = groupId => {
    executeGetQuota({ chainType: info.feeUnit, groupId, symbolArray: 'XRP', options: { targetChainType: info.desChain } })
    const smgInfo = smgList.find(v => v.groupId === groupId) || {};
    updateXRPTransParams({ groupAddr: getStoremanAddrByGpk1(smgInfo[`gpk${Number(smgInfo.curve2 === '0') + 1}`]), groupId, groupName: hexCharCodeToStr(smgInfo.groupId) });
  }

  const checkQuota = (rule, value, callback) => {
    value = value.split(' ')[0];
    if (new BigNumber(value).gt(0)) {
      let amount = form.getFieldValue('amount');
      if (isExceedBalance(value, amount)) {
        callback(rule.message);
        return;
      }
      callback();
    } else {
      callback(rule.message);
    }
  }

  const checkAmount = (rule, value, callback) => {
    try {
      const message = intl.get('NormalTransForm.amountIsIncorrect');
      if (new BigNumber(value).lte(0) || !checkAmountUnit(6, value)) {
        callback(message);
        return;
      }
      if (new BigNumber(value).lt(minQuota) || new BigNumber(value).lte(formatNumByDecimals(networkFee.lockFee, ancestorDecimals))) {
        let val = Math.max(value, formatNumByDecimals(networkFee.lockFee, ancestorDecimals))
        let errText = `${intl.get('CrossChainTransForm.invalidAmount1')}: ${val} ${info.unit}`;
        callback(errText);
        return;
      }
      if (new BigNumber(value).gt(maxQuota)) {
        callback(intl.get('CrossChainTransForm.overQuota'))
        return;
      }

      if (type === INBOUND) {
        if (new BigNumber(balance).minus(MINXRPBALANCE).minus(value).lt(0)) {
          callback(intl.get('Xrp.minAmount'));
          return;
        }
        let toAddr;
        let toValue = form.getFieldValue('to');
        const isNativeAddress = addressSelections.includes(toValue);
        const isNativeAccount = accountSelections.includes(toValue);
        if (isNativeAddress || isNativeAccount) {
          toAddr = isNativeAccount ? getValueByNameInfoAllType(toValue, 'address', info.toAccountList) : toValue
        } else {
          toAddr = toValue;
        }
        executeEstimatedFee({ from: address, to: XRPCrossTransParams.groupAddr, value, wanAddress: toAddr })
      } else {
        if (new BigNumber(balance).minus(value).lt(0)) {
          callback(intl.get('CrossChainTransForm.overOriginalBalance'));
          return;
        }
        setReceivedAmount(new BigNumber(value).minus(formatNumByDecimals(networkFee.lockFee, ancestorDecimals)).toString(10));
      }
      callback();
    } catch (err) {
      callback(message);
    }
  }

  const checkToAddr = (rule, value, callback) => {
    try {
      const isNativeAddress = addressSelections.includes(value);
      const isNativeAccount = accountSelections.includes(value);
      if (!(isNativeAddress || isNativeAccount)) {
        if (type === INBOUND) {
          pu.promisefy(wand.request, ['address_isEthAddress', { address: value }], this).then(ret => {
            ret ? callback() : callback(intl.get('NormalTransForm.invalidAddress'))
          }).catch(() => callback(intl.get('NormalTransForm.invalidAddress')))
        } else {
          pu.promisefy(wand.request, ['address_isXrpAddress', { address: value }], this).then(ret => {
            (ret[0] || ret[1]) ? callback() : callback(intl.get('NormalTransForm.invalidAddress'))
          }).catch(() => callback(intl.get('NormalTransForm.invalidAddress')))
        }
      } else {
        callback()
      }
    } catch (err) {
      callback(intl.get('NormalTransForm.invalidAddress'))
    }
  }

  const sendAllAmount = e => {
    if (e.target.checked) {
      setSendAll(true);
      let availableBalance = type === INBOUND ? new BigNumber(balance).minus(MINXRPBALANCE).toString(10) : balance
      form.setFieldsValue({ amount: availableBalance }, () => {
        form.validateFields(['amount'], { force: true });
      });
    } else {
      setSendAll(false)
      form.setFieldsValue({ amount: 0 });
    }
  }

  const handleOutBoundSaveOption = (gasPrice, gasLimit) => {
    updateXRPTransParams({ gasPrice, gasLimit });
    setAdvancedVisible(false);
  }

  return (
    <React.Fragment>
      <Modal
        visible
        destroyOnClose={true}
        closable={false}
        title={info.title}
        onCancel={toggleVisible}
        className={style['cross-chain-modal']}
        footer={[
          <Button key="back" className="cancel" onClick={toggleVisible}>{intl.get('Common.cancel')}</Button>,
          <Button disabled={spin} key="submit" type="primary" onClick={handleNext}>{intl.get('Common.next')}</Button>,
        ]}
      >
        <Spin spinning={spin} size="large" className="loadingData">
          <div className="validator-bg">
            <CommonFormItem
              form={form}
              colSpan={6}
              formName='from'
              disabled={true}
              options={{ initialValue: name }}
              prefix={<Icon type="wallet" className="colorInput" />}
              title={intl.get('Common.from') + ' (' + getFullChainName(fromChainSymbol) + ')'}
            />
            <CommonFormItem
              form={form}
              colSpan={6}
              formName='balance'
              disabled={true}
              options={{ initialValue: formatNum(balance) + ` ${info.unit}` }}
              prefix={<Icon type="wallet" className="colorInput" />}
              title={intl.get('Common.balance')}
            />
            <SelectForm
              form={form}
              colSpan={6}
              formName='storemanAccount'
              initialValue={smgList.length === 0 ? '' : smgList[0].groupId}
              selectedList={smgList.map(v => ({ text: hexCharCodeToStr(v.groupId), value: v.groupId }))}
              isTextValueData={true}
              handleChange={updateLockAccounts}
              formMessage={intl.get('Common.storemanGroup')}
            />
            <CommonFormItem
              form={form}
              colSpan={6}
              formName='quota'
              disabled={true}
              options={{ initialValue: `${maxQuota} ${info.unit}`, rules: [{ validator: checkQuota, message: intl.get('CrossChainTransForm.overQuota') }] }}
              prefix={<Icon type="credit-card" className="colorInput" />}
              title={intl.get('CrossChainTransForm.quota')}
            />
            <AutoCompleteForm
              form={form}
              colSpan={6}
              formName='to'
              dataSource={accountSelections}
              formMessage={intl.get('NormalTransForm.to') + ' (' + getFullChainName(info.desChain) + ')'}
              options={{ rules: [{ required: true, validator: checkToAddr }], initialValue: accountSelections[0] }}
            />
            <CommonFormItem
              form={form}
              colSpan={6}
              formName='totalFee'
              disabled={true}
              options={{ initialValue: totalFeeInUSD }}
              prefix={<Icon type="credit-card" className="colorInput" />}
              title={intl.get('CrossChainTransForm.estimateFee')}
              suffix={<Tooltip title={
                <table className={style['suffix_table']}>
                  <tbody>
                    <tr><td>{intl.get('CrossChainTransForm.userNetworkFee')}:</td><td>{userNetWorkFee}</td></tr>
                  </tbody>
                </table>
              }><Icon type="exclamation-circle" /></Tooltip>}
            />
            <CommonFormItem
              form={form}
              colSpan={6}
              formName='amount'
              placeholder={0}
              options={{ rules: [{ required: true, validator: checkAmount }] }}
              prefix={<Icon type="credit-card" className="colorInput" />}
              title={intl.get('Common.amount')}
            />
            <CommonFormItem
              form={form}
              colSpan={6}
              formName='receive'
              disabled={true}
              options={{ initialValue: `${receivedAmount} ${info.toUnit}` }}
              prefix={<Icon type="credit-card" className="colorInput" />}
              title={intl.get('CrossChainTransForm.youWillReceive')}
              suffix={<Tooltip title={
                <table className={style['suffix_table']}>
                  <tbody>
                    <tr><td>{intl.get('CrossChainTransForm.operationFee')}:</td><td>{crosschainNetWorkFee}</td></tr>
                  </tbody>
                </table>
              }><Icon type="exclamation-circle" /></Tooltip>}
            />
            <Checkbox checked={sendAll} onChange={sendAllAmount} style={{ padding: '0px 20px' }}>{intl.get('NormalTransForm.sendAll')}</Checkbox>
            {settings.reinput_pwd && <PwdForm form={form} colSpan={6} />}
            {type === OUTBOUND && <p className="onAdvancedT"><span onClick={() => setAdvancedVisible(true)}>{intl.get('NormalTransForm.advancedOptions')}</span></p>}
          </div>
        </Spin>
      </Modal>
      { confirmVisible && <Confirm visible={true} userNetWorkFee={userNetWorkFee} crosschainNetWorkFee={crosschainNetWorkFee} onCancel={() => setConfirmVisible(false)} sendTrans={onSend} toName={form.getFieldValue('to')}/> }
      { advancedVisible && type === OUTBOUND && <AdvancedOutboundOptionForm symbol={'XRP'} chainType={toChainSymbol} onCancel={() => setAdvancedVisible(false)} onSave={handleOutBoundSaveOption} from={address} />}
    </React.Fragment>
  )
});

export default CrossXRPForm;
