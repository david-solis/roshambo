const RockPaperScissors = artifacts.require('RockPaperScissors');
const helperTime = require('ganache-time-traveler');
const {advanceTime} = helperTime;
const assert = require("chai").assert;
const truffleAssert = require('truffle-assertions');
const {createTransactionResult, eventEmitted, reverts} = truffleAssert;
const {toBN, toWei, asciiToHex} = web3.utils;
const {getBalance, getBlock} = web3.eth;
const uuidv4 = require("uuid/v4");

contract('RockPaperScissors', (accounts) => {
    const NONE = 0, ROCK = 1, PAPER = 2, SCISSORS = 3, LIZARD = 4;
    const OPPONENT = 2;

    // duration for reveal
    const BN_MIN_DURATION_FOR_REVEAL = toBN(1800);  // 30 minutes in secs
    const BN_MAX_DURATION_FOR_REVEAL = toBN(3600);  // 1 hour in secs
    const BN_DURATION_FOR_REVEAL = toBN(1800);      // 30 minutes in secs

    // duration for join
    const BN_MIN_DURATION_FOR_JOIN = toBN(3600);    // 1 day in secs
    const BN_MAX_DURATION_FOR_JOIN = toBN(86400);   // 1 hour in secs
    const BN_DURATION_FOR_JOIN = toBN(43200);       // 12 hours in secs

    const BN_0 = toBN("0");
    const BN_1_ETH = toBN(toWei("1", "ether"));
    const BN_2_ETH = toBN(toWei("2", "ether"));

    const FAKE_GAME_ID = asciiToHex("Laputa: Castle in the Sky");
    const PASSWD = asciiToHex("Geheim");

    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

    const [OWNER, ALICE, BOB, CAROL] = accounts;

    let rps;
    let secret = [];

    beforeEach("deploy", async () => {
        rps = await RockPaperScissors.new(BN_DURATION_FOR_REVEAL, {from: OWNER});
    });

    beforeEach("prepare secret", function () {
        uuidv4(null, secret, 0);
    });

    describe("constructor", function () {
        it("should have initial balance equals to zero", async () => {
            const balance = toBN(await getBalance(rps.address));
            assert(balance.eq(BN_0), "contract balance is not zero");
        });

        it("should have emmitted duration4Reveal set event", async () => {
            const result = await createTransactionResult(rps, rps.transactionHash);
            await eventEmitted(result, "LogSetDuration4Reveal", log => {
                return log.sender === OWNER && log.duration4Reveal.eq(BN_DURATION_FOR_REVEAL);
            });
        });
    });

    describe("duration4Reveal", function () {
        it("should set rps duration4Reveal accordingly", async () => {
            const duration4Reveal = await rps.getDuration4Reveal();
            assert.strictEqual(duration4Reveal.toString(), BN_DURATION_FOR_REVEAL.toString(), "rps duration4Reveal mismatch");
        });

        it("duration for reveal must be greater or equal to MIN_DURATION_FOR_REVEAL", async () => {
            await reverts(
                rps.setDuration4Reveal(BN_MIN_DURATION_FOR_REVEAL - 1, {from: OWNER}),
                "duration for reveal must be greater or equal to MIN_DURATION_FOR_REVEAL");
        });

        it("duration for reveal must be less than or equal to MAX_DURATION_FOR_REVEAL", async () => {
            await reverts(
                rps.setDuration4Reveal(BN_MAX_DURATION_FOR_REVEAL + 1, {from: OWNER}),
                "duration for reveal must be less than or equal to MAX_DURATION_FOR_REVEAL");
        });
    });

    describe("fallback function", function () {
        it("should reject direct transaction with value", async () => {
            await reverts(
                rps.sendTransaction({from: ALICE, value: 1, gas: 3000000})
            );
        });

        it("should reject direct transaction without value", async () => {
            await reverts(
                rps.sendTransaction({from: ALICE, gas: 3000000})
            );
        });
    });

    describe("game ids", function () {
        it("sender is address ZERO", async () => {
            await reverts(
                rps.generateGameId(ADDRESS_ZERO, NONE, secret), "invalid sender");
        });

        it("NONE is out of bounds", async () => {
            await reverts(
                rps.generateGameId(ALICE, NONE, secret), "NONE is not an allowed value");
        });

        it("LIZARD is out of bounds", async () => {
            await rps.generateGameId(ALICE, LIZARD, secret).catch(function (error) {
                if (error.toString().indexOf("invalid opcode") === -1) assert(false, error.toString());
            })
        });

        it("should have different game ids across instances given same parameters", async () => {
            const otherInstance = await RockPaperScissors.new(BN_DURATION_FOR_REVEAL, {from: ALICE});

            const rpsGameId = await rps.generateGameId(ALICE, ROCK, secret);
            const otherInstanceGameId = await otherInstance.generateGameId(ALICE, ROCK, secret);

            assert.notEqual(rpsGameId, otherInstanceGameId);
        });

        it("should have different game ids across the same instance given different sender", async () => {
            const gameId1 = await rps.generateGameId(ALICE, ROCK, secret);
            const gameId2 = await rps.generateGameId(BOB, ROCK, secret);

            assert.notEqual(gameId1, gameId2);
        });

    });

    describe("createGame", () => {
        let id;

        beforeEach("prepare secret", async () => {
            id = await rps.generateGameId(ALICE, ROCK, secret);
        });

        it("invalid opponent", async () => {
            await reverts(
                rps.createGame(id, ADDRESS_ZERO, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH}),
                "invalid opponent");
        });

        it("duration for join greater or equal to MIN_DURATION_FOR_JOIN", async () => {
            await reverts(
                rps.createGame(id, BOB, BN_MIN_DURATION_FOR_JOIN - 1, {from: ALICE, value: BN_1_ETH}),
                "duration for join greater or equal to MIN_DURATION_FOR_JOIN");
        });

        it("duration for join must be less than or equal to MAX_DURATION_FOR_JOIN", async () => {
            await reverts(
                rps.createGame(id, BOB, BN_MAX_DURATION_FOR_JOIN + 1, {from: ALICE, value: BN_1_ETH}),
                "duration for join must be less than or equal to MAX_DURATION_FOR_JOIN");
        });

        it("game already exists", async () => {
            await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
            await reverts(
                rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH}),
                "game already exists");
        });

        it("should create a game", async () => {
            const balance1a = toBN(await getBalance(rps.address));
            const result = await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
            await eventEmitted(result, "LogCreateGame", log => {
                return (log.gameId === id && log.player === ALICE && log.opponent === BOB && BN_1_ETH.eq(log.bet));
            });
            // Check contract balance
            const balance1b = toBN(await getBalance(rps.address));
            assert.strictEqual(balance1b.sub(balance1a).toString(), BN_1_ETH.toString(), "contract balance mismatch");
            // Check storage
            const info = await rps.games(id);
            assert.strictEqual(info.player, ALICE, "player mismatch");
            assert.strictEqual(info.opponent, BOB, "opponent mismatch");
            assert.strictEqual(BN_1_ETH.toString(), info.bet.toString(), "bet mismatch");
            assert.notEqual(info.deadline.toString(), BN_0.toString(), "deadline for join not set");
        });
    });

    describe("joinGame", () => {
        let id;

        beforeEach("prepare secret", async () => {
            id = await rps.generateGameId(ALICE, ROCK, secret);
        });

        it("NONE is not an allowed choice", async () => {
            await reverts(
                rps.joinGame(id, NONE, {from: BOB, value: BN_1_ETH}), "NONE is not an allowed value");
        });

        it("game does not exist", async () => {
            await reverts(
                rps.joinGame(id, PAPER, {from: BOB, value: BN_1_ETH}), "game does not exist");
        });

        it("fake id", async () => {
            await reverts(
                rps.joinGame(FAKE_GAME_ID, PAPER, {from: BOB, value: BN_1_ETH}), "game does not exist");
        });

        it("opponent is not the one specified by the player", async () => {
            await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
            await reverts(
                rps.joinGame(id, PAPER, {from: CAROL, value: BN_1_ETH}),
                "opponent is not the one specified by the player");
        });

        it("not enough balance", async () => {
            await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_2_ETH});
            await reverts(
                rps.joinGame(id, PAPER, {from: BOB, value: BN_1_ETH}));
        });

        it("remainder balance", async () => {
            await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
            await rps.joinGame(id, PAPER, {from: BOB, value: BN_2_ETH});
            // Check balance
            const balance = await rps.getPayment(BOB);
            assert.strictEqual(BN_1_ETH.toString(), balance.toString(), "balance mismatch");
        });

        it("use remainder balance", async () => {
            // First game
            await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
            await rps.joinGame(id, PAPER, {from: BOB, value: BN_1_ETH});
            await rps.revealChoice(ROCK, secret, {from: ALICE});
            // Second game
            const id2 = await rps.generateGameId(ALICE, SCISSORS, PASSWD);
            await rps.createGame(id2, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_2_ETH});
            await rps.joinGame(id2, PAPER, {from: BOB, value: BN_0});
            // Check balance
            const balance = await rps.getPayment(BOB);
            assert.strictEqual(BN_0.toString(), balance.toString(), "balance mismatch");
        });

        it("opponent is already participating in the game", async () => {
            await rps.createGame(id, CAROL, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
            await rps.joinGame(id, PAPER, {from: CAROL, value: BN_1_ETH});
            await reverts(
                rps.joinGame(id, PAPER, {from: CAROL, value: BN_1_ETH}),
                "opponent is already participating in the game");
        });

        it("should join a game", async () => {
            const balance1a = toBN(await getBalance(rps.address));
            await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
            const result = await rps.joinGame(id, PAPER, {from: BOB, value: BN_1_ETH});
            const block = await getBlock(result.blockNumber);
            // Try to assure deadline4Reveal was updated
            await eventEmitted(result, "LogJoinGame", log => {
                return (log.gameId === id && log.opponentChoice.toNumber() === PAPER &&
                    block.timestamp < log.deadline4Reveal && BN_1_ETH.eq(log.amount));
            });
            // Check contract balance
            const balance1b = toBN(await getBalance(rps.address));
            assert.strictEqual(balance1b.sub(balance1a).toString(), BN_2_ETH.toString(),
                "contract balance mismatch");
            // Check storage
            const info = await rps.games(id);
            assert.strictEqual(info.player, ALICE, "player mismatch");
            assert.strictEqual(info.opponent, BOB, "opponent mismatch");
            assert.strictEqual(info.opponentChoice.toNumber(), PAPER, "opponent choice mismatch");
            assert.strictEqual(BN_1_ETH.toString(), info.bet.toString(), "bet mismatch");
            assert.notEqual(info.deadline.toString(), BN_0.toString(), "deadline for reveal not set");
        });
    });

    describe("deadline expired", () => {
        let id;

        beforeEach("create game", async () => {
            id = await rps.generateGameId(ALICE, ROCK, secret);
            await rps.createGame(id, CAROL, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
        });

        beforeEach(async () => {
            let snapShot = await helperTime.takeSnapshot();
            snapshotId = snapShot['result'];
        });

        afterEach(async () => {
            await helperTime.revertToSnapshot(snapshotId);
        });

        it("deadline for join has expired", async () => {
            await advanceTime(BN_DURATION_FOR_JOIN * 1000);
            await reverts(
                rps.joinGame(id, PAPER, {from: CAROL, value: BN_1_ETH}), "deadline for join has expired");
        });

        it("deadline for reveal has expired", async () => {
            await rps.joinGame(id, PAPER, {from: CAROL, value: BN_1_ETH});
            await advanceTime(BN_DURATION_FOR_REVEAL * 1000);
            await reverts(
                rps.revealChoice(ROCK, secret, {from: ALICE}), "deadline for reveal has expired");
        });
    });

    describe("revealChoice", () => {
        let id;

        beforeEach("create game", async () => {
            id = await rps.generateGameId(ALICE, ROCK, secret, {from: ALICE});
            await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
        });

        it("game does not exist", async () => {
            await reverts(
                rps.revealChoice(ROCK, PASSWD), "game does not exist");
        });

        it("opponent has not yet joined the game", async () => {
            await reverts(
                rps.revealChoice(ROCK, secret, {from: ALICE}), "opponent has not yet joined the game");
        });

        it("should reveal choice", async () => {
            await rps.joinGame(id, PAPER, {from: BOB, value: BN_1_ETH});
            const result = await rps.revealChoice(ROCK, secret, {from: ALICE});
            await eventEmitted(result, "LogRevealChoice", log => {
                return (log.sender === ALICE && log.gameId === id && log.playerChoice.toNumber() === ROCK &&
                    log.payoff.toNumber() === OPPONENT);
            });
            // Check balance
            const balance = await rps.getPayment(BOB);
            assert.strictEqual(BN_2_ETH.toString(), balance.toString(), "balance mismatch");
            // Check storage
            const info = await rps.games(id);
            assert.strictEqual(info.player, ALICE, "player mismatch");
            assert.strictEqual(info.opponent, ADDRESS_ZERO, "opponent not cleaned");
            assert.strictEqual(info.opponentChoice.toNumber(), NONE, "opponent choice not cleaned");
            assert.strictEqual(BN_0.toString(), info.bet.toString(), "bet not cleaned");
            assert.equal(info.deadline.toString(), BN_0.toString(), "deadline not cleaned");
        });
    });

    describe("cancelGame", () => {
        let id;

        beforeEach("prepare secret", async () => {
            id = await rps.generateGameId(ALICE, ROCK, secret);
        });

        it("opponent is already participating in the game", async () => {
            await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
            await rps.joinGame(id, PAPER, {from: BOB, value: BN_1_ETH});
            await reverts(
                rps.cancelGame(id), "opponent is already participating in the game");

        });

        it("deadline for join has not yet expired", async () => {
            await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
            await reverts(
                rps.cancelGame(id), "deadline for join has not yet expired");

        });

        it("game does not exist", async () => {
            await reverts(
                rps.cancelGame(id), "game does not exist");
        });
    });

    describe("claim", () => {
        let id;

        beforeEach("create game", async () => {
            id = await rps.generateGameId(ALICE, ROCK, secret);
            await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
        });

        it("opponent has not yet joined the game", async () => {
            await reverts(
                rps.claim(id), "opponent has not yet joined the game");
        });

        it("deadline for reveal has not yet expired", async () => {
            await rps.joinGame(id, PAPER, {from: BOB, value: BN_1_ETH});
            await reverts(
                rps.claim(id), "deadline for reveal has not yet expired");
        });

        it("game does not exist", async () => {
            await reverts(
                rps.claim(FAKE_GAME_ID), "game does not exist");
        });
    });

    describe("penalize", () => {
        let id;

        beforeEach("create game", async () => {
            id = await rps.generateGameId(ALICE, ROCK, secret);
            await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
        });

        beforeEach(async () => {
            let snapShot = await helperTime.takeSnapshot();
            snapshotId = snapShot['result'];
        });

        afterEach(async () => {
            await helperTime.revertToSnapshot(snapshotId);
        });

        it("should cancel game", async () => {
            await advanceTime(BN_DURATION_FOR_JOIN * 1000);
            await rps.cancelGame(id);
            // Check balances
            const contractBalance = toBN(await getBalance(rps.address));
            assert.strictEqual(BN_1_ETH.toString(), contractBalance.toString(), "balance mismatch");
            const balance = await rps.getPayment(ALICE);
            assert.strictEqual(BN_1_ETH.toString(), balance.toString(), "balance mismatch");
            // Check storage
            const info = await rps.games(id);
            assert.strictEqual(info.player, ALICE, "player mismatch");
            assert.strictEqual(info.opponent, ADDRESS_ZERO, "opponent not cleaned");
            assert.strictEqual(info.opponentChoice.toNumber(), NONE, "opponent choice not cleaned");
            assert.strictEqual(BN_0.toString(), info.bet.toString(), "bet not cleaned");
            assert.equal(info.deadline.toString(), BN_0.toString(), "deadline not cleaned");
        });

        it("should claim", async () => {
            await rps.joinGame(id, PAPER, {from: BOB, value: BN_1_ETH});
            await advanceTime(BN_DURATION_FOR_REVEAL * 1000);
            await rps.claim(id);
            // Check balances
            const contractBalance = toBN(await getBalance(rps.address));
            assert.strictEqual(BN_2_ETH.toString(), contractBalance.toString(), "balance mismatch");
            const balance = await rps.getPayment(BOB);
            assert.strictEqual(BN_2_ETH.toString(), balance.toString(), "balance mismatch");
            // Check storage
            const info = await rps.games(id);
            assert.strictEqual(info.player, ALICE, "player mismatch");
            assert.strictEqual(info.opponent, ADDRESS_ZERO, "opponent not cleaned");
            assert.strictEqual(info.opponentChoice.toNumber(), NONE, "opponent choice not cleaned");
            assert.strictEqual(BN_0.toString(), info.bet.toString(), "bet not cleaned");
            assert.equal(info.deadline.toString(), BN_0.toString(), "deadline not cleaned");
        });
    });

    describe("withdrawPayment", function () {
        it("balance zero", async () => {
            await reverts(
                rps.withdrawPayment({from: CAROL}), "balance is zero"
            );
        });

        it("should withdrawPayment", async () => {
            // Create a game with bet = 1 ETH
            id = await rps.generateGameId(ALICE, ROCK, secret);
            await rps.createGame(id, BOB, BN_DURATION_FOR_JOIN, {from: ALICE, value: BN_1_ETH});
            await rps.joinGame(id, ROCK, {from: BOB, value: BN_1_ETH});
            await rps.revealChoice(ROCK, secret, {from: ALICE});
            // Get balances: (1) contract and (2) ALICE
            const balance1a = toBN(await getBalance(rps.address));
            const balance2a = toBN(await getBalance(ALICE));
            const result = await rps.withdrawPayment({from: ALICE});
            await eventEmitted(result, "LogPaymentWithdrawn", log => {
                return (log.toWhom === ALICE && BN_1_ETH.eq(log.amount));
            });
            // Check contract balance
            const balance1b = toBN(await getBalance(rps.address));
            assert.strictEqual(balance1a.sub(balance1b).toString(), BN_1_ETH.toString(), "contract balance mismatch");
            // Check player balance
            const balance2b = toBN(await getBalance(ALICE));
            const gasUsed2b = toBN(result.receipt.gasUsed);
            const transact2b = await web3.eth.getTransaction(result.tx);
            const gasPrice2b = toBN(transact2b.gasPrice);
            assert.strictEqual(balance2b.add(gasUsed2b.mul(gasPrice2b)).sub(balance2a).toString(),
                BN_1_ETH.toString(), "player balance mismatch");
        });
    });
});
