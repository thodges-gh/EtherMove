pragma solidity ^0.4.24;

import "chainlink/solidity/contracts/Chainlinked.sol";

contract EtherMove is Chainlinked, Ownable {

  using SafeMath for uint256;

  uint256 constant ESCROW_AMOUNT_USD = 500;

  address public beneficiary;
  address public depositor;
  bytes32 public specId;

  event DepositMade(uint256 indexed amount);
  event EscrowFailed(uint256 indexed balance, uint256 indexed required);
  event EscrowTransferred(uint256 indexed amount);
  event RequestFulfilled(bytes32 indexed requestId, uint256 indexed price);

  constructor(
    address _link,
    address _oracle,
    address _depositor,
    address _beneficiary
  )
    public
    payable
    Ownable()
  {
    setLinkToken(_link);
    setOracle(_oracle);
    depositor = _depositor;
    beneficiary = _beneficiary;
  }

  function()
    external
    payable
    onlyDepositor
  {
    emit DepositMade(msg.value);
  }

  function fulfillEthereumPrice(bytes32 _requestId, uint256 _price)
    public
    checkChainlinkFulfillment(_requestId)
  {
    emit RequestFulfilled(_requestId, _price);
    uint256 transferAmount = ESCROW_AMOUNT_USD.mul(10**20).div(_price);
    if (transferAmount <= address(this).balance) {
      emit EscrowTransferred(transferAmount);
      beneficiary.transfer(transferAmount);
      selfdestruct(depositor);
    } else {
      emit EscrowFailed(address(this).balance, transferAmount);
    }
  }

  function requestEthereumPrice()
    public
    contractFunded
    hasSpecId
  {
    ChainlinkLib.Run memory run = newRun(specId, this, "fulfillEthereumPrice(bytes32,uint256)");
    run.add("url", "https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD");
    string[] memory path = new string[](1);
    path[0] = "USD";
    run.addStringArray("path", path);
    run.addInt("times", 100);
    chainlinkRequest(run, LINK(1));
  }

  function setSpecId(string _specId)
    public
    onlyOwner
  {
    specId = stringToBytes32(_specId);
  }

  function stringToBytes32(string memory source)
    private
    pure
    returns (bytes32 result)
  {
    bytes memory tempEmptyStringTest = bytes(source);
    if (tempEmptyStringTest.length == 0) {
      return 0x0;
    }

    assembly {
      result := mload(add(source, 32))
    }
  }

  modifier contractFunded() {
    require(address(this).balance > 0, "Escrow has not been sent to contract.");
    _;
  }

  modifier hasSpecId() {
    require(specId != 0x0, "SpecId must be present.");
    _;
  }

  modifier onlyDepositor() {
    require(msg.sender == depositor, "Only the depositor may call this function.");
    _;
  }

}