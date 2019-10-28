const truffleAssert = require('truffle-assertions');
const {asciiToHex} = web3.utils;
const {eventEmitted, reverts} = truffleAssert;

const RockPaperScissors = artifacts.require("RockPaperScissors");

contract('RockPaperScissors', accounts => {
    const [OWNER, ALICE, BOB] = accounts;

    const ROCK = 1;
    const FAKE_GAME_ID = asciiToHex("Laputa: Castle in the Sky");
    const PASSWD = asciiToHex("Geheim");

    let pausable;

    beforeEach("deploy new Pausable", async () => {
        pausable = await RockPaperScissors.new(600, {from: OWNER});
    });

    describe("pause", function () {
        it("should allow pause of contract", async () => {
            const result = await pausable.setPaused(true, {from: OWNER});
            assert.isTrue(result.receipt.status, "receipt status must be true");
            // Check event
            await eventEmitted(result, "LogPausedSet", log => {
                return log.sender === OWNER && log.newPausedState;
            });
        });

        it("should allow unpause of contract", async () => {
            pausable.setPaused(true, {from: OWNER});
            const result = await pausable.setPaused(false, {from: OWNER});
            assert.isTrue(result.receipt.status, "receipt status must be true");
            // Check event
            await eventEmitted(result, "LogPausedSet", log => {
                return log.sender === OWNER && !log.newPausedState;
            });
        });
    });

    describe("can't execute when is paused", function () {
        beforeEach("pause", async () => {
            await pausable.setPaused(true, {from: OWNER});
        });

        it("createGame", async () => {
            await reverts(
                pausable.createGame(FAKE_GAME_ID, BOB, 12 * 60, {from: ALICE})
            );
        });

        it("joinGame", async () => {
            await reverts(
                pausable.joinGame(FAKE_GAME_ID, ROCK, {from: BOB})
            );
        });

        it("revealChoice", async () => {
            await reverts(
                pausable.revealChoice(ROCK, PASSWD)
            );
        });

        it("cancelGame", async () => {
            await reverts(
                pausable.cancelGame(FAKE_GAME_ID)
            );
        });

        it("claim", async () => {
            await reverts(
                pausable.claim(FAKE_GAME_ID)
            );
        });
    });

    describe("can't execute when is not paused", function () {
        it("kill", async () => {
            await reverts(
                pausable.kill()
            );
        });
    });
});

