var EtherMove = artifacts.require("./EtherMove.sol");
var Oracle = artifacts.require("./Oracle.sol");
var LinkToken = artifacts.require("./LinkToken.sol");

module.exports = function(deployer) {
  deployer.deploy(LinkToken).then( function() {
    deployer.deploy(Oracle, LinkToken.address).then( function() {
      deployer.deploy(EtherMove, LinkToken.address, Oracle.address, web3.eth.accounts[1].address, web3.eth.accounts[2].address, {from: web3.eth.accounts[0]});
    })
  })
};