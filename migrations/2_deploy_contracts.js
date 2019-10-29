const RockPaperScissors = artifacts.require("RockPaperScissors");
const { toBN, toWei } = web3.utils;

module.exports = function(deployer) {
    deployer.deploy(
        RockPaperScissors,
        1800 // 30 minutes in secs
    );
};
