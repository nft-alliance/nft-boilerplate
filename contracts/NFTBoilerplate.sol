// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/* 

      _____________________________________
     |                                     |
     |                  The                |
     |               ARBIDUDES             |
     |      https://www.arbidudes.xyz/     |
     |          Twitter: @ArbiDudes        |
     |_____________________________________|

               Proud member of
      ___________________________________
     |                                   |
     |                The                |
     |            NFT Alliance           |
     |    https://www.nftalliance.xyz/   |
     |___________________________________|
     

//////////////////////////////////////////////////
/////////////@@@@@@@@@@@//////////////////////////
/////////@@@@@@@@@@@@@@@@@////////////////////////
///////@@@@@@@@@@@@@@@@@@@@@//////////////////////
/////@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@///////
/////@@......@@@@@@/...................//////@@///
/////@@..........@@/...................//////@@///
/////@@....@@@@...............@@@@.....//////@@///
/////&&....@@@@...............@@@@.....//////&&///
/////@@....@@@@...............@@@@.....//////@@///
/////@@..****...................*****..//////@@///
/////@@....@@@@@@@@@@@@@@@@@@@@@.......//////@@///
/////@&................................//////@&///
/////@@......@@@@@@/...................//////@@///
/////@@..............................////////@@///
/////@@..............................////////@@///
/////&&...........................///////////&&///
///////@&//.....................///////////@@/////
/////////@@////////,......///////////////@@///////
///////////@@@@......./////////////////@&@@///////

*/

contract NFTBoilerplate is
  ERC721,
  ERC721Enumerable,
  Pausable,
  Ownable,
  ReentrancyGuard
{
  using Counters for Counters.Counter;

  uint256 public price = 50000000000000000; //0.05 ETH
  uint256 private _maxSupply = 10000;
  uint256 private _maxMintAmount = 20;
  mapping(address => bool) public whitelisted;

  Counters.Counter private _tokenIdCounter;

  event NFTCreated(uint256 indexed tokenId);

  constructor(string memory newBaseURI, uint256 newMaxSupply)
    ERC721("NFTBoilerplate", "NFT")
  {
    setBaseURI(newBaseURI);
    setMaxSupply(newMaxSupply);

    // Increment tokenIdCounter so it starts at one
    _tokenIdCounter.increment();
  }

  function getCurrentTokenId() public view returns (uint256) {
    return _tokenIdCounter.current();
  }

  function setPublicPrice(uint256 newPrice) public onlyOwner {
    price = newPrice;
  }

  function setMaxSupply(uint256 _newMaxSupply) private {
    _maxSupply = _newMaxSupply;
  }

  function ownerWithdraw() external onlyOwner {
    payable(owner()).transfer(address(this).balance);
  }

  function pause() public onlyOwner {
    _pause();
  }

  function unpause() public onlyOwner {
    _unpause();
  }

  /**
   * @dev Base URI for computing {tokenURI}. Empty by default, can be overriden
   * in child contracts.
   */
  string private baseURI = "";

  function _baseURI() internal view virtual override returns (string memory) {
    return baseURI;
  }

  function setBaseURI(string memory newBaseURI) public onlyOwner {
    baseURI = newBaseURI;
  }

  // Mint
  modifier tokenMintable(uint256 tokenId) {
    require(tokenId > 0 && tokenId <= _maxSupply, "Token ID invalid");
    require(price <= msg.value, "Ether value sent is not correct");
    _;
  }

  modifier onlyWhitelisted(address account) {
    require(whitelisted[account], "You need to be in the Whitelist");
    _;
  }

  function safeMint(address to) public onlyOwner {
    uint256 tokenId = _tokenIdCounter.current();
    require(tokenId > 0 && tokenId <= _maxSupply, "Token ID invalid");
    _safeMint(to, tokenId);
    emit NFTCreated(tokenId);
    _removeFromWhitelist(to);
    _tokenIdCounter.increment();
  }

  function mint()
    public
    payable
    nonReentrant
    tokenMintable(_tokenIdCounter.current())
  {
    uint256 tokenId = _tokenIdCounter.current();
    _safeMint(_msgSender(), tokenId);
    emit NFTCreated(tokenId);
    _removeFromWhitelist(_msgSender());
    _tokenIdCounter.increment();
  }

  function whitelistedMint() public nonReentrant onlyWhitelisted(_msgSender()) {
    uint256 tokenId = _tokenIdCounter.current();
    require(tokenId > 0 && tokenId <= _maxSupply, "Token ID invalid");
    _safeMint(_msgSender(), tokenId);
    emit NFTCreated(tokenId);
    _removeFromWhitelist(_msgSender());
    _tokenIdCounter.increment();
  }

  function mintMultiple(uint256 _num) public payable {
    uint256 supply = totalSupply();
    address to = _msgSender();
    require(_num > 0, "The minimum is one token");
    require(_num <= _maxMintAmount, "You can mint a max of 20 tokens");
    require(supply + _num <= _maxSupply, "Exceeds maximum supply");
    require(msg.value >= price * _num, "Ether sent is not enough");

    for (uint256 i; i < _num; i++) {
      uint256 tokenId = _tokenIdCounter.current();
      _safeMint(to, tokenId);
      emit NFTCreated(tokenId);
      _tokenIdCounter.increment();
    }
    _removeFromWhitelist(to);
  }

  // Allow the DAO to claim in case some item remains unclaimed in the future
  function ownerClaim() public nonReentrant onlyOwner {
    uint256 tokenId = _tokenIdCounter.current();
    require(tokenId > 0 && tokenId <= _maxSupply, "Token ID invalid");
    _safeMint(owner(), tokenId);
    emit NFTCreated(tokenId);
    _tokenIdCounter.increment();
  }

  function ownerClaimMultiple(uint256 _num) public nonReentrant onlyOwner {
    uint256 supply = totalSupply();
    require(_num > 0, "The minimum is one token");
    require(supply + _num <= _maxSupply, "Exceeds maximum supply");

    for (uint256 i; i < _num; i++) {
      uint256 tokenId = _tokenIdCounter.current();
      _safeMint(owner(), tokenId);
      emit NFTCreated(tokenId);
      _tokenIdCounter.increment();
    }
  }

  // Whitelist managment
  function addToWhitelist(address account) public onlyOwner {
    uint256 num = balanceOf(account);
    if (num == 0) {
      whitelisted[account] = true;
    }
  }

  function addToWhitelistMultiple(address[] memory _accounts) public onlyOwner {
    uint256 size = _accounts.length;
    require(size <= 100, "Too many accounts");

    for (uint256 i = 0; i < size; i++) {
      address account = _accounts[i];
      addToWhitelist(account);
    }
  }

  function removeFromWhitelist(address account) public onlyOwner {
    _removeFromWhitelist(account);
  }

  function _removeFromWhitelist(address account) private {
    whitelisted[account] = false;
  }

  function removeFromWhitelistMultiple(address[] memory _accounts)
    public
    onlyOwner
  {
    uint256 size = _accounts.length;
    require(size <= 100, "Too many accounts");

    for (uint256 i = 0; i < size; i++) {
      address account = _accounts[i];
      _removeFromWhitelist(account);
    }
  }

  //

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
  ) internal override(ERC721, ERC721Enumerable) whenNotPaused {
    super._beforeTokenTransfer(from, to, tokenId);
  }

  // The following functions are overrides required by Solidity.

  function supportsInterface(bytes4 interfaceId)
    public
    view
    override(ERC721, ERC721Enumerable)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }
}
