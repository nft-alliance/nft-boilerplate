import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

const OWNABLE_MSG = "Ownable: caller is not the owner";

describe("NFTBoilerplate", function () {
  let contract: Contract;
  let owner: SignerWithAddress;
  let address1: SignerWithAddress;
  let address2: SignerWithAddress;
  let address3: SignerWithAddress;

  beforeEach(async () => {
    const ContractFactory = await ethers.getContractFactory("NFTBoilerplate");
    [owner, address1, address2, address3] = await ethers.getSigners();
    contract = await ContractFactory.deploy("https://baseUri/", 10000);
  });

  // Correct deployment
  it("Should initialize contract with name, symbol, baseUri and token counter", async () => {
    expect(await contract.symbol()).to.equal("NFT");
    expect(await contract.name()).to.equal("NFTBoilerplate");
    expect(await contract.getCurrentTokenId()).to.equal(1);
    // mint a token and get tokenUri
    await contract.connect(owner).ownerClaim({ value: 0 });
    expect(await contract.connect(owner).tokenURI(1)).to.be.equal(
      "https://baseUri/1"
    );
  });

  // Ownership
  it("Should set the right owner", async () => {
    expect(await contract.owner()).to.equal(await owner.address);
  });

  it("Should has the right price after being deployed", async () => {
    const price = await contract.price();
    const formatedPrice = ethers.utils.formatEther(price);
    expect(formatedPrice).to.equal("0.05");
  });

  it("Should set the price correctly", async () => {
    await contract.setPublicPrice(BigNumber.from("70000000000000000"));
    const price = await contract.price();
    const formatedPrice = ethers.utils.formatEther(price);
    expect(formatedPrice).to.equal("0.07");
    await expect(
      contract
        .connect(address1)
        .setPublicPrice(BigNumber.from("40000000000000000"))
    ).to.be.revertedWith(OWNABLE_MSG);
  });

  it("Should allow owner to widthdraw", async () => {
    // Address 1 mints token 1 to send some eth to the contract
    // NOTE: Any ideas about how to send funds to the contract?
    const price = await contract.price();
    contract.connect(address1).mint({ value: price });

    // owner should have more eth after withdrawal
    const balancePreWithdrawal = await owner.getBalance();
    await contract.connect(owner).ownerWithdraw();
    const balancePostWithdrawal = await owner.getBalance();
    expect(balancePostWithdrawal).to.be.gt(balancePreWithdrawal);
    const estimatedBalanceAfterGas = balancePreWithdrawal
      .add(price)
      .sub(BigNumber.from(2300).mul(await contract.provider.getGasPrice()));
    const diffError = estimatedBalanceAfterGas.sub(balancePostWithdrawal).abs();
    const acceptedError = BigNumber.from("50000000000000"); // 0,00005 eth

    expect(diffError).to.be.lt(acceptedError);
  });

  it("Should not allow non-owner to widthdraw", async () => {
    await expect(contract.connect(address1).ownerWithdraw()).to.be.revertedWith(
      OWNABLE_MSG
    );
  });

  // Base URI
  it("Should allow owner to set baseURI", async () => {
    const newBaseUri = "new_base_uri";
    const tokenId = await contract.getCurrentTokenId();
    // Address 1 mints token 1 to be able to form tokenURI
    const price = await contract.price();
    contract.connect(address1).mint({ value: price });
    await contract.connect(owner).setBaseURI(newBaseUri);
    expect(await contract.connect(owner).tokenURI(1)).to.be.equal(
      `${newBaseUri}${tokenId}`
    );
  });

  it("Should not allow non-owner to set baseURI", async () => {
    await expect(contract.connect(address1).setBaseURI("")).to.be.revertedWith(
      OWNABLE_MSG
    );
  });

  // MINTING

  it("Should allow owner to safe mint", async () => {
    const tokenId = await contract.getCurrentTokenId();
    await contract.connect(owner).safeMint(address1.address);
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      address1.address
    );
    expect(await contract.connect(owner).ownerOf(tokenId)).to.not.be.equal(
      owner.address
    );
  });

  it("Should increase counter after owner safe mint", async () => {
    await contract.connect(owner).safeMint(address1.address);

    expect(await contract.connect(owner).getCurrentTokenId()).to.be.equal(2);
  });

  it("Should revert if non-owner try to safe mint", async () => {
    await expect(
      contract.connect(address1).safeMint(address2.address)
    ).to.be.revertedWith(OWNABLE_MSG);
  });

  it("Should not increase token counter if reverted", async () => {
    const tokenIdBeforeMintAttempt = await contract.getCurrentTokenId();
    await expect(
      contract.connect(address1).safeMint(address2.address)
    ).to.be.revertedWith(OWNABLE_MSG);
    expect(tokenIdBeforeMintAttempt).to.be.equal(
      await contract.getCurrentTokenId()
    );
  });

  it("Should mint available token", async () => {
    // should mint
    const tokenId = await contract.getCurrentTokenId();
    const price = await contract.price();
    await contract.connect(address1).mint({ value: price });
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      address1.address
    );
  });

  it("Should increase counter after mint available token", async () => {
    const price = await contract.price();
    await contract.connect(address1).mint({ value: price });
    expect(await contract.connect(owner).getCurrentTokenId()).to.be.equal(2);
  });

  it("Should emit Transfer and NFTCreated event after minting available token", async () => {
    // should emit Event
    const tokenId = await contract.getCurrentTokenId();
    const price = await contract.price();
    await expect(await contract.connect(address1).mint({ value: price }))
      .to.emit(contract, "Transfer")
      .withArgs(ethers.constants.AddressZero, address1.address, tokenId)
      .to.emit(contract, "NFTCreated")
      .withArgs(tokenId);
  });

  it("Should emit Transfer and NFTCreated event after owner safe mint available token", async () => {
    // should emit Event
    const tokenId = await contract.getCurrentTokenId();
    await expect(
      await contract.connect(owner).safeMint(address1.address, { value: 0 })
    )
      .to.emit(contract, "Transfer")
      .withArgs(ethers.constants.AddressZero, address1.address, tokenId)
      .to.emit(contract, "NFTCreated")
      .withArgs(tokenId);
  });

  it("Should not let mint without funds", async () => {
    const funds = 0;

    await expect(
      contract.connect(address1).mint({ value: funds })
    ).to.be.revertedWith("Ether value sent is not correct");
  });

  it("Should mint when sending more funds than needed", async () => {
    const tokenId = await contract.getCurrentTokenId();
    const price = await contract.price();
    const biggerFunds = BigNumber.from(price).add(BigNumber.from(price));

    await expect(contract.connect(address1).mint({ value: biggerFunds })).to.not
      .be.reverted;
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      address1.address
    );
  });

  it("Should let owner mint free", async () => {
    // balance after should be greater than prevBalance minus price (check gas)
    const tokenId = await contract.getCurrentTokenId();
    const balancePreMint = await owner.getBalance();
    const price = await contract.price();
    await expect(contract.connect(owner).ownerClaim({ value: 0 })).to.not.be
      .reverted;
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      owner.address
    );
    const balancePostMint = await owner.getBalance();

    const diff = balancePreMint.sub(balancePostMint).abs();
    const acceptedError = BigNumber.from("500000000000000"); // 0,0005 eth

    expect(diff).to.be.lt(acceptedError);
    expect(diff).to.be.lt(price);
  });

  it("Should increase counter after owner claim available token", async () => {
    await contract.connect(owner).ownerClaim({ value: 0 });
    expect(await contract.connect(owner).getCurrentTokenId()).to.be.equal(2);
  });

  it("Should emit after owner claim", async () => {
    const tokenId = await contract.getCurrentTokenId();

    await expect(contract.connect(owner).ownerClaim({ value: 0 }))
      .to.emit(contract, "Transfer")
      .withArgs(ethers.constants.AddressZero, owner.address, tokenId)
      .to.emit(contract, "NFTCreated")
      .withArgs(tokenId);
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      owner.address
    );
  });

  it("Should emit after owner claim multiple", async () => {
    await expect(contract.connect(owner).ownerClaimMultiple(3, { value: 0 }))
      .to.emit(contract, "NFTCreated")
      .withArgs(1)
      .to.emit(contract, "NFTCreated")
      .withArgs(2)
      .to.emit(contract, "NFTCreated")
      .withArgs(3);

    expect(await contract.connect(owner).ownerOf(3)).to.be.equal(owner.address);
    await expect(contract.connect(owner).ownerOf(4)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
  });

  it("Should increase counter after owner claim multiple available tokens", async () => {
    await contract.connect(owner).ownerClaimMultiple(3, { value: 0 });
    expect(await contract.connect(owner).getCurrentTokenId()).to.be.equal(4);
  });

  it("Should let owner mint free for someone else", async () => {
    // balance after should be greater than prevBalance minus price (check gas)
    const tokenId = await contract.getCurrentTokenId();
    const balancePreMint = await owner.getBalance();
    const price = await contract.price();
    await expect(
      contract.connect(owner).safeMint(address1.address, { value: 0 })
    ).to.not.be.reverted;

    // expect address 1 has token
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      address1.address
    );
    expect(await contract.connect(owner).ownerOf(tokenId)).to.not.be.equal(
      owner.address
    );

    const balancePostMint = await owner.getBalance();
    const diff = balancePreMint.sub(balancePostMint).abs();
    const acceptedError = BigNumber.from("500000000000000"); // 0,0005 eth

    expect(diff).to.be.lt(acceptedError);
    expect(diff).to.be.lt(price);
  });

  it("Should not let non-owner claim tokens", async () => {
    await expect(
      contract.connect(address1).ownerClaim({ value: 0 })
    ).to.be.revertedWith(OWNABLE_MSG);
  });

  it("Should let user mint N < maxAllowed tokens", async () => {
    const price = await contract.price();
    const numTokens = 20;

    await contract
      .connect(address1)
      .mintMultiple(numTokens, { value: price.mul(numTokens) });
    expect(await contract.getCurrentTokenId()).to.be.equal(BigNumber.from(21));
    // expect token 1 and 20 belongs to address1
    expect(await contract.connect(owner).ownerOf(1)).to.be.equal(
      address1.address
    );
    expect(await contract.connect(owner).ownerOf(20)).to.be.equal(
      address1.address
    );
    // expect token 21 doesn't exist
    await expect(contract.connect(owner).ownerOf(21)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
  });

  it("Should emit after user mint multiple", async () => {
    const price = await contract.price();
    const num = 3;
    await expect(
      contract.connect(address1).mintMultiple(num, { value: price.mul(num) })
    )
      .to.emit(contract, "NFTCreated")
      .withArgs(1)
      .to.emit(contract, "NFTCreated")
      .withArgs(2)
      .to.emit(contract, "NFTCreated")
      .withArgs(3);

    expect(await contract.connect(owner).ownerOf(3)).to.be.equal(
      address1.address
    );
    await expect(contract.connect(owner).ownerOf(4)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
  });

  it("Should increase counter after user mint multiple", async () => {
    const price = await contract.price();
    const num = 3;
    await contract
      .connect(address1)
      .mintMultiple(num, { value: price.mul(num) });

    expect(await contract.getCurrentTokenId()).to.be.equal(BigNumber.from(4));
  });

  it("Should not let mint multiple in not funds", async () => {
    const price = await contract.price();
    const num = 3;
    await expect(
      contract
        .connect(address1)
        .mintMultiple(num, { value: price.mul(num - 1) })
    ).to.be.revertedWith("Ether sent is not enough");
  });

  it("Should not let user mint N > maxAllowed tokens", async () => {
    const price = await contract.price();
    const numTokens = 21;

    await expect(
      contract
        .connect(address1)
        .mintMultiple(numTokens, { value: price.mul(numTokens) })
    ).to.be.revertedWith("You can mint a max of 20 tokens");
  });

  it("Should not let user mint multiple with 0 or less tokens", async () => {
    const price = await contract.price();
    const numTokens = 0;
    const negativeNumTokens = -10;

    await expect(
      contract
        .connect(address1)
        .mintMultiple(numTokens, { value: price.mul(numTokens) })
    ).to.be.revertedWith("The minimum is one token");

    await expect(
      contract.connect(address1).mintMultiple(negativeNumTokens, {
        value: price.mul(10),
      })
    ).to.be.reverted;
  });

  it("Should not mint if paused", async () => {
    const price = await contract.price();
    await contract.connect(owner).pause();
    await expect(
      contract.connect(address1).mint({ value: price })
    ).to.be.revertedWith("Pausable: paused");
  });

  it("Should not mint multiple if paused", async () => {
    const price = await contract.price();
    const num = 10;
    await contract.connect(owner).pause();
    await expect(
      contract.connect(address1).mintMultiple(num, { value: price.mul(num) })
    ).to.be.revertedWith("Pausable: paused");
  });

  it("Should not let owner claim beyond the 10000 tokens limit", async () => {
    const num = 10001;
    await expect(
      contract.connect(owner).ownerClaimMultiple(num, { value: 0 })
    ).to.be.revertedWith("Exceeds maximum supply");
  });

  it("Should let owner claim 10000 tokens limit", async () => {
    const num = 10000;
    await expect(contract.connect(owner).ownerClaimMultiple(num, { value: 0 }))
      .to.not.be.revertedWith("Exceeds maximum supply")
      .to.be.revertedWith(
        "TransactionExecutionError: Transaction ran out of gas"
      );
  });

  it("Should not let owner claim multiple with 0 or less tokens", async () => {
    const numTokens = 0;
    const negativeNumTokens = -10;

    await expect(
      contract.connect(owner).ownerClaimMultiple(numTokens, { value: 0 })
    ).to.be.revertedWith("The minimum is one token");

    await expect(
      contract.connect(owner).ownerClaimMultiple(negativeNumTokens, {
        value: 0,
      })
    ).to.be.reverted;
  });

  it("Should increase contract balance after mint", async () => {
    const price = await contract.price();

    const balancePreMint = await contract.provider.getBalance(contract.address);
    expect(balancePreMint).to.equal(0);

    await contract.connect(address1).mint({ value: price });
    const balancePostMint = await contract.provider.getBalance(
      contract.address
    );

    expect(balancePostMint).to.equal(BigNumber.from("50000000000000000"));
  });

  it("Should increase contract balance after mint multiple", async () => {
    const price = await contract.price();
    const num = 3;

    const balancePreMint = await contract.provider.getBalance(contract.address);
    expect(balancePreMint).to.equal(0);

    await contract
      .connect(address1)
      .mintMultiple(num, { value: price.mul(num) });
    const balancePostMint = await contract.provider.getBalance(
      contract.address
    );

    expect(balancePostMint).to.equal(BigNumber.from("150000000000000000"));
  });

  it("Should not mint more than maxSupply", async () => {
    const factory = await ethers.getContractFactory("NFTBoilerplate");
    const contractLimit = await factory.deploy("https://baseUri/", 2);
    const price = await contractLimit.price();

    await contractLimit.connect(address1).mint({ value: price });
    await contractLimit.connect(address1).mint({ value: price });
    await expect(
      contractLimit.connect(address1).mint({ value: price })
    ).to.be.revertedWith("Token ID invalid");
    expect(await contractLimit.getCurrentTokenId()).to.equal(3);
    await expect(contractLimit.connect(owner).ownerOf(4)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
  });

  it("Should not safeMint more than maxSupply", async () => {
    const factory = await ethers.getContractFactory("NFTBoilerplate");
    const contractLimit = await factory.deploy("https://baseUri/", 2);

    contractLimit.connect(owner).safeMint(address1.address);
    contractLimit.connect(owner).safeMint(address1.address);
    await expect(
      contractLimit.connect(owner).safeMint(address1.address)
    ).to.be.revertedWith("Token ID invalid");

    expect(await contractLimit.getCurrentTokenId()).to.equal(3);
    await expect(contractLimit.connect(owner).ownerOf(3)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
    expect(await contractLimit.connect(owner).ownerOf(2)).to.be.equal(
      address1.address
    );
  });

  it("Should not ownerClaim more than maxSupply", async () => {
    const Factory = await ethers.getContractFactory("NFTBoilerplate");
    const contractLimit = await Factory.deploy("https://baseUri/", 2);

    await contractLimit.connect(owner).ownerClaim();
    await contractLimit.connect(owner).ownerClaim();

    await expect(contractLimit.connect(owner).ownerClaim()).to.be.revertedWith(
      "Token ID invalid"
    );

    expect(await contractLimit.getCurrentTokenId()).to.equal(3);
    await expect(contractLimit.connect(owner).ownerOf(3)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
    expect(await contractLimit.connect(owner).ownerOf(2)).to.be.equal(
      owner.address
    );
  });

  it("Should not mint multiple more than maxSupply", async () => {
    const Factory = await ethers.getContractFactory("NFTBoilerplate");
    const max = 5;
    const contractLimit = await Factory.deploy("https://baseUri/", max);
    const price = await contractLimit.price();

    await expect(
      contractLimit.connect(address1).mintMultiple(6, { value: price })
    ).to.be.revertedWith("Exceeds maximum supply");
    await expect(
      contractLimit
        .connect(address1)
        .mintMultiple(max, { value: price.mul(max) })
    ).to.not.be.reverted;
    expect(await contractLimit.getCurrentTokenId()).to.equal(6);
  });

  it("Should not ownerClaim multiple more than maxSupply", async () => {
    const Factory = await ethers.getContractFactory("NFTBoilerplate");
    const max = 5;
    const contractLimit = await Factory.deploy("https://baseUri/", max);

    await expect(
      contractLimit.connect(owner).ownerClaimMultiple(6)
    ).to.be.revertedWith("Exceeds maximum supply");
    await expect(contractLimit.connect(owner).ownerClaimMultiple(5)).to.not.be
      .reverted;
    expect(await contractLimit.getCurrentTokenId()).to.equal(6);
  });

  // TODO: WHITELIST test and implementation
  it("Should add an account to the whitelist", async () => {
    await contract.connect(owner).addToWhitelist(address1.address);

    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address2.address)
    ).to.be.equal(false);
  });

  it("Should not add an account to the whitelist if caller non-owner", async () => {
    await expect(
      contract.connect(address1).addToWhitelist(address2.address)
    ).to.be.revertedWith(OWNABLE_MSG);
  });

  it("Should add a list of accounts to the whitelist", async () => {
    await contract
      .connect(owner)
      .addToWhitelistMultiple([address1.address, address2.address]);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address2.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address3.address)
    ).to.be.equal(false);
  });

  it("Should not add a list of accounts to the whitelist if non-owner", async () => {
    await expect(
      contract
        .connect(address1)
        .addToWhitelistMultiple([
          address1.address,
          address2.address,
          address3.address,
        ])
    ).to.be.revertedWith(OWNABLE_MSG);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(false);
    expect(
      await contract.connect(owner).whitelisted(address2.address)
    ).to.be.equal(false);
    expect(
      await contract.connect(owner).whitelisted(address3.address)
    ).to.be.equal(false);
  });

  it("Should not add more accounts than permited to the whitelist", async () => {
    const accounts = Array(101).fill(address1.address);
    await expect(
      contract.connect(owner).addToWhitelistMultiple(accounts)
    ).to.be.revertedWith("Too many accounts");
  });

  it("Should have public access the whitelist", async () => {
    await contract.connect(owner).addToWhitelist(address2.address);
    expect(
      await contract.connect(address1).whitelisted(address2.address)
    ).to.be.equal(true);
  });

  it("Should add only accounts without tokens to the whitelist", async () => {
    const tokenId = await contract.getCurrentTokenId();
    await contract.connect(owner).safeMint(address1.address);
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      address1.address
    );
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(false);
    await contract.connect(owner).addToWhitelistMultiple([address1.address]);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(false);
  });

  it("Should only add accounts without token when adding multiple accouts to whitelist", async () => {
    const tokenId = await contract.getCurrentTokenId();
    await contract.connect(owner).safeMint(address2.address);
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      address2.address
    );

    await contract
      .connect(owner)
      .addToWhitelistMultiple([
        address1.address,
        address2.address,
        address3.address,
      ]);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address2.address)
    ).to.be.equal(false);
    expect(
      await contract.connect(owner).whitelisted(address3.address)
    ).to.be.equal(true);
  });

  it("Should remove from whitelist after mint", async () => {
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    const price = await contract.price();
    await contract.connect(address1).mint({ value: price });
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(false);
  });

  it("Should remove from whitelist after safeMint", async () => {
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);

    await contract.connect(owner).safeMint(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(false);
  });

  it("Should remove from whitelist after mintMultiple", async () => {
    await contract
      .connect(owner)
      .addToWhitelistMultiple([
        address1.address,
        address2.address,
        address3.address,
      ]);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address2.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address3.address)
    ).to.be.equal(true);

    const price = await contract.price();
    const numTokens = 3;

    await contract
      .connect(address2)
      .mintMultiple(numTokens, { value: price.mul(numTokens) });

    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address2.address)
    ).to.be.equal(false);
    expect(
      await contract.connect(owner).whitelisted(address3.address)
    ).to.be.equal(true);
  });

  it("Should remove from whitelist after whitelist mint", async () => {
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);

    await contract.connect(address1).whitelistedMint({ value: 0 });
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(false);
    expect(await contract.connect(owner).ownerOf(1)).to.be.equal(
      address1.address
    );
  });

  it("Should remove an account from the whitelist", async () => {
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    await contract.connect(owner).removeFromWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(false);
  });

  it("Should not remove an account from the whitelist if non-owner", async () => {
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    await expect(
      contract.connect(address2).removeFromWhitelist(address1.address)
    ).to.be.revertedWith(OWNABLE_MSG);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
  });

  it("Should remove a list of accounts from the whitelist", async () => {
    await contract
      .connect(owner)
      .addToWhitelistMultiple([
        address1.address,
        address2.address,
        address3.address,
      ]);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address2.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address3.address)
    ).to.be.equal(true);
    await contract
      .connect(owner)
      .removeFromWhitelistMultiple([address1.address, address3.address]);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(false);
    expect(
      await contract.connect(owner).whitelisted(address2.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address3.address)
    ).to.be.equal(false);
  });

  it("Should not remove a list of accounts from the whitelist if non-owner", async () => {
    await contract
      .connect(owner)
      .addToWhitelistMultiple([
        address1.address,
        address2.address,
        address3.address,
      ]);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address2.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address3.address)
    ).to.be.equal(true);
    await expect(
      contract
        .connect(address3)
        .removeFromWhitelistMultiple([address1.address, address3.address])
    ).to.be.revertedWith(OWNABLE_MSG);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address2.address)
    ).to.be.equal(true);
    expect(
      await contract.connect(owner).whitelisted(address3.address)
    ).to.be.equal(true);
  });

  it("Should not remove more accounts than permited from the whitelist", async () => {
    const accounts = Array(101).fill(address1.address);
    await expect(
      contract.connect(owner).removeFromWhitelistMultiple(accounts)
    ).to.be.revertedWith("Too many accounts");
  });

  it("Should remove maximum accounts permited from the whitelist", async () => {
    const accounts = Array(100).fill(address1.address);
    await expect(contract.connect(owner).removeFromWhitelistMultiple(accounts))
      .to.not.be.reverted;
  });

  // whitelist minting
  it("Should be able to whitelistmint free if whitelisted", async () => {
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    await expect(contract.connect(address1).whitelistedMint({ value: 0 })).to
      .not.be.reverted;
    expect(await contract.connect(owner).ownerOf(1)).to.be.equal(
      address1.address
    );
  });

  it("Should not be able to whitelistmint if not whitelisted", async () => {
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(false);
    await expect(
      contract.connect(address1).whitelistedMint({ value: 0 })
    ).to.be.revertedWith("You need to be in the Whitelist");
    await expect(contract.connect(owner).ownerOf(1)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
  });

  it("Should not be able to whitelistmint if removed from whitelisted", async () => {
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    await contract.connect(owner).removeFromWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(false);
    await expect(
      contract.connect(address1).whitelistedMint({ value: 0 })
    ).to.be.revertedWith("You need to be in the Whitelist");
    await expect(contract.connect(owner).ownerOf(1)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
  });

  it("Should not be able to mint free even if whitelited", async () => {
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    await expect(
      contract.connect(address1).mint({ value: 0 })
    ).to.be.revertedWith("Ether value sent is not correct");
  });

  // Note: users should go through the whitelistedMint method to claim giveaways
  it("Should be able to mint paying the price even if whitelited", async () => {
    const price = await contract.price();
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    await expect(contract.connect(address1).mint({ value: price })).to.not.be
      .reverted;
    expect(await contract.connect(owner).ownerOf(1)).to.be.equal(
      address1.address
    );
  });

  it("Should not be able to mint multiple free even if whitelited", async () => {
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    await expect(
      contract.connect(address1).mintMultiple(5, { value: 0 })
    ).to.be.revertedWith("Ether sent is not enough");
  });

  // Note: users should go through the whitelistedMint method to claim giveaways
  it("Should be able to mint multiple paying the price even if whitelited", async () => {
    const price = await contract.price();
    const numTokens = 2;
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    await expect(
      contract
        .connect(address1)
        .mintMultiple(numTokens, { value: price.mul(numTokens) })
    ).to.not.be.reverted;
    expect(await contract.connect(owner).ownerOf(1)).to.be.equal(
      address1.address
    );
    expect(await contract.connect(owner).ownerOf(2)).to.be.equal(
      address1.address
    );
    await expect(contract.connect(owner).ownerOf(3)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
  });

  it("Should be able to mint if whitelited and then removed", async () => {
    const price = await contract.price();
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    await contract.connect(owner).removeFromWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(false);
    await expect(contract.connect(address1).mint({ value: price })).to.not.be
      .reverted;
    expect(await contract.connect(owner).ownerOf(1)).to.be.equal(
      address1.address
    );
  });

  it("Should be able to multiple mint if whitelited and then removed", async () => {
    const price = await contract.price();
    const numTokens = 2;
    await contract.connect(owner).addToWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(true);
    await contract.connect(owner).removeFromWhitelist(address1.address);
    expect(
      await contract.connect(owner).whitelisted(address1.address)
    ).to.be.equal(false);
    await expect(
      contract
        .connect(address1)
        .mintMultiple(numTokens, { value: price.mul(numTokens) })
    ).to.not.be.reverted;
    expect(await contract.connect(owner).ownerOf(1)).to.be.equal(
      address1.address
    );
    expect(await contract.connect(owner).ownerOf(2)).to.be.equal(
      address1.address
    );
    await expect(contract.connect(owner).ownerOf(3)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
  });
});
