import React from 'react';
import { HashRouter, withRouter, Switch, Route } from 'react-router-dom';
import {
  Layout,
  Portfolio,
  WanAccount,
  Settings,
  Trezor,
  Ledger,
  Delegation,
  Validator,
  Offline,
  SignMessage,
  TokenTrans,
  E20TokenTrans,
  EthAccount,
  BtcAccount,
  EosAccount,
  CrossETH,
  CrossE20,
  CrossBTC,
  CrossEOS,
  DApps,
  DAppMarket,
  AddDApp } from './containers';

const Main = withRouter(props => <Layout {...props} />);

export default () => {
  return (
      <HashRouter>
        <Main>
          <Switch>
            <Route exact path="/" component={Portfolio} />
            <Route path="/wanAccount" component={WanAccount} />
            <Route path="/ethaccount" component={EthAccount} />
            <Route path="/btcaccount" component={BtcAccount} />
            <Route path="/eosaccount" component={EosAccount} />
            <Route path="/crossETH" component={CrossETH} />
            <Route path="/crossBTC" component={CrossBTC} />
            <Route path="/crossEOS" component={CrossEOS} />
            <Route path="/settings" component={Settings} />
            <Route path="/trezor" component={Trezor} />
            <Route path="/ledger" component={Ledger} />
            <Route path="/offline" component={Offline} />
            <Route path="/signmessage" component={SignMessage} />
            <Route path="/delegation" component={Delegation} />
            <Route path="/validator" component={Validator} />
            <Route path="/tokens/WAN/:tokenAddr/:symbol" component={TokenTrans} />
            <Route path="/tokens/ETH/:tokenAddr/:symbol" component={E20TokenTrans} />
            <Route path="/crossChain/ETH/:tokenAddr/:symbol" component={CrossE20} />
            <Route path="/crossChain/EOS/:tokenAddr/:symbol" component={CrossEOS} />
            <Route path="/AddDApp" component={AddDApp} />
            <Route path="/dapp/:url" component={DApps} />
            <Route path="/dAppMarket" component={DAppMarket} />
          </Switch>
        </Main>
      </HashRouter>
  );
};
