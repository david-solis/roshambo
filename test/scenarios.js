const RockPaperScissors = artifacts.require('RockPaperScissors');
const assert = require("chai").assert;
const truffleAssert = require('truffle-assertions');
const {eventEmitted} = truffleAssert;
const {toBN, toWei, asciiToHex} = web3.utils;
const {getBalance} = web3.eth;
const uuidv4 = require("uuid/v4");

contract('RockPaperScissors', (accounts) => {
    const NONE = 0, ROCK = 1, PAPER = 2, SCISSORS = 3;
    const choices = ["NONE", "ROCK", "PAPER", "SCISSORS"];
    const TIE = 0, PLAYER = 1, OPPONENT = 2;
    const payoff = ["TIE", "PLAYER", "OPPONENT"];
    const BN_DURATION_FOR_JOIN = toBN(86400); // 1 day in secs
    const BN_DURATION_FOR_REVEAL = toBN(1800);  // 30 minutes in secs
    const BN_0 = toBN("0");
    const BN_1_ETH = toBN(toWei("1", "ether"));
    const BN_2_ETH = toBN(toWei("2", "ether"));

    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

    const [OWNER, ALICE, BOB] = accounts;

    const cases = [
        {
            case: "1. Tie",
            player: ALICE,
            playerChoice: ROCK,
            opponent: BOB,
            opponentChoice: ROCK,
            bet: BN_1_ETH,
            payoff: TIE,
            expectedPlayerBalance: BN_1_ETH,
            expectedOpponentBalance: BN_1_ETH
        },
        {
            case: "2. Tie",
            player: ALICE,
            playerChoice: PAPER,
            opponent: BOB,
            opponentChoice: PAPER,
            bet: BN_1_ETH,
            payoff: TIE,
            expectedPlayerBalance: BN_1_ETH,
            expectedOpponentBalance: BN_1_ETH
        },
        {
            case: "3. Tie",
            player: ALICE,
            playerChoice: SCISSORS,
            opponent: BOB,
            opponentChoice: SCISSORS,
            bet: BN_1_ETH,
            payoff: TIE,
            expectedPlayerBalance: BN_1_ETH,
            expectedOpponentBalance: BN_1_ETH
        },
        {
            case: "4. Player wins",
            player: ALICE,
            playerChoice: ROCK,
            opponent: BOB,
            opponentChoice: SCISSORS,
            bet: BN_1_ETH,
            payoff: PLAYER,
            expectedPlayerBalance: BN_2_ETH,
            expectedOpponentBalance: BN_0
        },
        {
            case: "5. Player wins",
            player: ALICE,
            playerChoice: PAPER,
            opponent: BOB,
            opponentChoice: ROCK,
            bet: BN_1_ETH,
            payoff: PLAYER,
            expectedPlayerBalance: BN_2_ETH,
            expectedOpponentBalance: BN_0
        },
        {
            case: "6. Player wins",
            player: ALICE,
            playerChoice: SCISSORS,
            opponent: BOB,
            opponentChoice: PAPER,
            bet: BN_1_ETH,
            payoff: PLAYER,
            expectedPlayerBalance: BN_2_ETH,
            expectedOpponentBalance: BN_0
        },
        {
            case: "7. Opponent wins",
            player: ALICE,
            playerChoice: ROCK,
            opponent: BOB,
            opponentChoice: PAPER,
            bet: BN_1_ETH,
            payoff: OPPONENT,
            expectedPlayerBalance: BN_0,
            expectedOpponentBalance: BN_2_ETH
        },
        {
            case: "8. Opponent wins",
            player: ALICE,
            playerChoice: PAPER,
            opponent: BOB,
            opponentChoice: SCISSORS,
            bet: BN_1_ETH,
            payoff: OPPONENT,
            expectedPlayerBalance: BN_0,
            expectedOpponentBalance: BN_2_ETH
        },
        {
            case: "9. Opponent wins",
            player: ALICE,
            playerChoice: SCISSORS,
            opponent: BOB,
            opponentChoice: ROCK,
            bet: BN_1_ETH,
            payoff: OPPONENT,
            expectedPlayerBalance: BN_0,
            expectedOpponentBalance: BN_2_ETH
        }
    ];

    let rps;
    let secret = [];

    beforeEach("deploy", async () => {
        rps = await RockPaperScissors.new(BN_DURATION_FOR_REVEAL, {from: OWNER});
    });

    beforeEach("prepare secret", function () {
        uuidv4(null, secret, 0);
    });

    describe("scenarios", () => {
        cases.forEach(sample => {
            it(`${sample.case}. Player choice is ${choices[sample.playerChoice]} and opponent choice is ${choices[sample.opponentChoice]}. Payoff is ${payoff[sample.payoff]}`, async () => {
                const id = await rps.generateGameId(sample.player, sample.playerChoice, secret, {from: sample.player});
                await rps.createGame(id, sample.opponent, BN_DURATION_FOR_JOIN, {
                    from: sample.player,
                    value: sample.bet
                });
                await rps.joinGame(id, sample.opponentChoice, {from: sample.opponent, value: sample.bet});
                // Check contract balance
                const contractBalance = toBN(await getBalance(rps.address));
                assert.strictEqual((sample.bet * 2).toString(), contractBalance.toString(), "contract balance mismatch");
                const result = await rps.revealChoice(sample.playerChoice, secret, {from: sample.player});
                await eventEmitted(result, "LogRevealChoice", log => {
                    return (log.sender === sample.player && log.gameId === id && log.playerChoice.toNumber() === sample.playerChoice &&
                        log.payoff.toNumber() === sample.payoff);
                });
                // Check player balance
                const playerBalance = await rps.getPayment(sample.player);
                assert.strictEqual(sample.expectedPlayerBalance.toString(), playerBalance.toString(), "player balance mismatch");
                // Check opponent balance
                const balance = await rps.getPayment(sample.opponent);
                assert.strictEqual(sample.expectedOpponentBalance.toString(), balance.toString(), "opponent balance mismatch");
                // Check storage
                const info = await rps.games(id);
                assert.strictEqual(info.player, sample.player, "player mismatch");
                assert.strictEqual(info.opponent, ADDRESS_ZERO, "opponent not cleaned");
                assert.strictEqual(info.opponentChoice.toNumber(), NONE, "opponent choice not cleaned");
                assert.strictEqual(BN_0.toString(), info.bet.toString(), "bet not cleaned");
                assert.equal(info.deadline.toString(), BN_0.toString(), "deadline not cleaned");
            });
        });
    });
});
