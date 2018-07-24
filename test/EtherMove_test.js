"use strict";

let EtherMove = artifacts.require("EtherMove.sol");
let Oracle = artifacts.require("Oracle.sol");
let LinkToken = artifacts.require("LinkToken.sol");

contract("EtherMove", () => {
  let tryCatch = require("../helpers.js").tryCatch;
  let errTypes = require("../helpers.js").errTypes;
  let owner = web3.eth.accounts[0];
  let depositor = web3.eth.accounts[1];
  let beneficiary = web3.eth.accounts[2];
  let stranger = web3.eth.accounts[3];
  let node = web3.eth.accounts[4];
  let linkContract, oracleContract, etherMoveContract;
  
  const DEPOSIT_AMOUNT = 1;
  const ETH_USD_PRICE = 50000;
  const ETH_USD_PRICE_OVER = 50100;
  const ETH_USD_PRICE_UNDER = 49900;
  const SPEC_ID = "d41a0bdf968a43aca8822cf81a2c1fa7";
  const SPEC_HEX = 0x6434316130626466393638613433616361383832326366383161326331666137;
  const NO_SPEC = 0x0000000000000000000000000000000000000000000000000000000000000000;

  let encodeUint256 = function encodeUint256(int) {
    let zeros = "0000000000000000000000000000000000000000000000000000000000000000";
    let payload = int.toString(16);
    return (zeros + payload).slice(payload.length);
  }

  let placeDeposit = async function placeDeposit(_from, _amount) {
    return await web3.eth.sendTransaction({
      from: _from,
      to: etherMoveContract.address,
      value: web3.toWei(DEPOSIT_AMOUNT, "ether")
    });
  }

  let getEvents = function getEvents(contract) {
    return new Promise((resolve, reject) => {
      contract.allEvents().get((error, events) => {
        if (error) {
          reject(error);
        } else {
          resolve(events);
        };
      });
    });
  }

  let getLatestEvent = async function getLatestEvent(contract) {
    let events = await getEvents(contract);
    return events[events.length - 1];
  }

  beforeEach(async function () {
    linkContract = await LinkToken.new();
    oracleContract = await Oracle.new(linkContract.address);
    etherMoveContract = await EtherMove.new(
      linkContract.address, 
      oracleContract.address,
      depositor,
      beneficiary,
      {from: owner}
    );
    await linkContract.transfer(etherMoveContract.address, web3.toWei('1', 'ether'));
  });

  it("only accepts deposit from depositor", async function () {
    await tryCatch(placeDeposit(stranger), errTypes.revert);
    await tryCatch(placeDeposit(beneficiary), errTypes.revert);
    await tryCatch(placeDeposit(owner), errTypes.revert);
    assert.equal(await web3.eth.getBalance(etherMoveContract.address), 0);
    await placeDeposit(depositor);
    assert.equal(await web3.eth.getBalance(etherMoveContract.address), web3.toWei(DEPOSIT_AMOUNT, "ether"));
    let event = await getLatestEvent(etherMoveContract);
    assert.equal(event.event, "DepositMade");
  });

  describe("setSpecId", () => {
    it("can only be called by the owner", async function () {
      await tryCatch(etherMoveContract.setSpecId(SPEC_ID, {from: stranger}), errTypes.revert);
      await tryCatch(etherMoveContract.setSpecId(SPEC_ID, {from: beneficiary}), errTypes.revert);
      await tryCatch(etherMoveContract.setSpecId(SPEC_ID, {from: depositor}), errTypes.revert);
      assert.equal(await etherMoveContract.specId(), NO_SPEC);
      await etherMoveContract.setSpecId(SPEC_ID, {from: owner});
      assert.equal(await etherMoveContract.specId(), SPEC_HEX);
    });
  });

  describe("requestEthereumPrice", () => {

    context("without a deposit or specId", () => {
      it("reverts", async function () {
        assert.equal(await web3.eth.getBalance(etherMoveContract.address), 0);
        assert.equal(await etherMoveContract.specId(), NO_SPEC);
        await tryCatch(etherMoveContract.requestEthereumPrice(), errTypes.revert);
      });
    });

    context("with a deposit, no specId", () => {
      it("reverts", async function () {
        await placeDeposit(depositor);
        assert.equal(await web3.eth.getBalance(etherMoveContract.address), web3.toWei(DEPOSIT_AMOUNT, "ether"));
        assert.equal(await etherMoveContract.specId(), NO_SPEC);
        await tryCatch(etherMoveContract.requestEthereumPrice(), errTypes.revert);
      });
    });

    context("with a specId, no deposit", () => {
      it("reverts", async function () {
        assert.equal(await web3.eth.getBalance(etherMoveContract.address), 0);
        await etherMoveContract.setSpecId(SPEC_ID, {from: owner});
        assert.equal(await etherMoveContract.specId(), SPEC_HEX);
        await tryCatch(etherMoveContract.requestEthereumPrice(), errTypes.revert);
      });
    });

    context("with a specId and deposit", () => {
      it("creates the request", async function () {
        await placeDeposit(depositor);
        assert.equal(await web3.eth.getBalance(etherMoveContract.address), web3.toWei(DEPOSIT_AMOUNT, "ether"));
        await etherMoveContract.setSpecId(SPEC_ID, {from: owner});
        assert.equal(await etherMoveContract.specId(), SPEC_HEX);
        let tx = await etherMoveContract.requestEthereumPrice();
        let log = tx.receipt.logs[2];
        assert.equal(log.address, oracleContract.address);
      });
    });
  });

  describe("fulfillEthereumPrice", () => {
    let internalId;

    beforeEach(async () => {
      await oracleContract.transferOwnership(node, {from: owner});
      await placeDeposit(depositor);
      await etherMoveContract.setSpecId(SPEC_ID, {from: owner});
      await etherMoveContract.requestEthereumPrice();
      let event = await getLatestEvent(oracleContract);
      internalId = event.args.internalId;
    });

    it("can only be called by the oracle contract", async function () {
      let response = '0x' + encodeUint256(ETH_USD_PRICE);
      await tryCatch(oracleContract.fulfillData(internalId, response, {from: stranger}), errTypes.revert);
      await tryCatch(oracleContract.fulfillData(internalId, response, {from: owner}), errTypes.revert);
      await tryCatch(oracleContract.fulfillData(internalId, response, {from: depositor}), errTypes.revert);
      await tryCatch(oracleContract.fulfillData(internalId, response, {from: beneficiary}), errTypes.revert);
      await oracleContract.fulfillData(internalId, response, {from: node});
      let event = await getLatestEvent(etherMoveContract);
      assert.equal(event.event, "EscrowTransferred");    
    });

    context("when the requestId is not recognized", () => {
      it("reverts", async function () {
        let fakeId = 9;
        let response = '0x' + encodeUint256(ETH_USD_PRICE);
        await tryCatch(oracleContract.fulfillData(fakeId, response, {from: node}), errTypes.revert);
      });
    });

    context("when the contract doesn't have enough funds", () => {
      it("does not transfer", async function () {
        let response = '0x' + encodeUint256(ETH_USD_PRICE_UNDER);
        await oracleContract.fulfillData(internalId, response, {from: node});
        let events = await getEvents(etherMoveContract);
        let contractBalance = await web3.eth.getBalance(etherMoveContract.address);
        assert.equal(contractBalance, web3.toWei(DEPOSIT_AMOUNT, "ether"));
        assert.equal(events[1].event, "EscrowFailed");
      });
    });

    context("when the contract has more than enough funds", () => {
      it("sends the remaining to the depositor", async function () {
        let depositorBeforeBalance = await web3.eth.getBalance(depositor);
        let beneficiaryBeforeBalance = await web3.eth.getBalance(beneficiary);
        let response = '0x' + encodeUint256(ETH_USD_PRICE_OVER);
        await oracleContract.fulfillData(internalId, response, {from: node});
        let depositorAfterBalance = await web3.eth.getBalance(depositor);
        let beneficiaryAfterBalance = await web3.eth.getBalance(beneficiary);
        let contractBalance = await web3.eth.getBalance(etherMoveContract.address);
        assert.isAbove(depositorAfterBalance.toNumber(), depositorBeforeBalance.toNumber());
        assert.isAbove(beneficiaryAfterBalance.toNumber(), beneficiaryBeforeBalance.toNumber());
        assert.equal(contractBalance, 0);
      });
    });
  });
});