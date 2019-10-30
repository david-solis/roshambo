pragma solidity ^0.5.0;

import "./SafeMath.sol";
import "./PullPayment.sol";

/*
 * Thus contract implements the classic game Rock, Paper, Scissors.
 *
 * Use cases.
 *
 * The player generates a game identifier based on his choice and a password.
 * Create a game. The player creates a game by submitting the game identifier, opponent, bet (can be zero),
 * and deadline for join
 * Join a game. The opponent joins the game by submitting his clear choice
 * Reveal choice. The player reveals his choice. The Winner is awarded the bet, or if a tie, the bets are returned to
 * players.
 * Cancel a game. In cases where the opponent doesn't counter the game, the player can reclaim after join deadline,
 * i.e., the opponent is penalized)
 * Claim. In cases where the player doesn't reveal his choice before reveal deadline, the opponent can reclaim his bet,
 * i.e., the player is penalized
 * Withdraw. The players can ask to transfer stakes to their wallet.
*/
contract RockPaperScissors is Pausable, PullPayment {
    using SafeMath for uint;

    enum Shape {NONE, ROCK, PAPER, SCISSORS}
    enum Payoff {TIE, PLAYER, OPPONENT}

    struct Game {
        address player;
        address opponent;
        Shape playerChoice;
        Shape opponentChoice;
        uint bet;
        // a single slot for deadline4Reveal and deadline4Join
        uint deadline;
    }

    mapping(bytes32 => Game) public games;

    // duration for reveal
    uint private MIN_DURATION_FOR_REVEAL = 1800; // 30 minutes in seconds
    uint private MAX_DURATION_FOR_REVEAL = 3600; // 1 hour in seconds
    // duration for join
    uint private MIN_DURATION_FOR_JOIN = 3600;   // 1 hour in seconds
    uint private MAX_DURATION_FOR_JOIN = 86400;  // 1 day in seconds

    uint private duration4Reveal;

    event LogSetDuration4Reveal(address indexed sender, uint duration4Reveal);

    event LogCreateGame(address indexed player, bytes32 indexed gameId, address indexed opponent, uint bet,
        uint deadline4Join);

    event LogJoinGame(bytes32 indexed gameId, Shape opponentChoice, uint amount, uint deadline4Reveal);

    event LogRevealChoice(address indexed sender, bytes32 indexed gameId, Shape playerChoice, Payoff payoff);

    event LogCancelGame(address indexed sender, bytes32 indexed gameId);

    event LogClaim(address indexed sender, bytes32 indexed gameId);

    event LogKill(address indexed owner);

    constructor(uint _duration4Reveal) Pausable(false) public {
        setDuration4Reveal(_duration4Reveal);
    }

    function setDuration4Reveal(uint _duration4Reveal) public fromOwner {
        require(MIN_DURATION_FOR_REVEAL <= _duration4Reveal,
            "duration for reveal must be greater or equal to MIN_DURATION_FOR_REVEAL");
        require(_duration4Reveal <= MAX_DURATION_FOR_REVEAL,
            "duration for reveal must be less than or equal to MAX_DURATION_FOR_REVEAL");
        duration4Reveal = _duration4Reveal;
        emit LogSetDuration4Reveal(msg.sender, duration4Reveal);
    }

    function getDuration4Reveal() view public returns (uint) {
        return duration4Reveal;
    }

    /*
     * Players can access each game via a unique key, which is a hash derived from the inputs that the game creator
     * provided.
     */
    function generateGameId(address sender, Shape choice, bytes32 secret) view public returns(bytes32 hashedChoice) {
        require(sender != address(0), "invalid sender");
        require(choice != Shape.NONE, "NONE is not an allowed value");
        hashedChoice = keccak256(abi.encodePacked(this, sender, choice, secret));
    }

    /*
     * The player creates a game by submitting his hashed choice, i.e., the gameId.
     */
    function createGame(bytes32 gameId, address opponent, uint duration4Join) payable public whenNotPaused {
        require(opponent != address(0), "invalid opponent");
        require(MIN_DURATION_FOR_JOIN <= duration4Join, "duration for join greater or equal to MIN_DURATION_FOR_JOIN");
        require(duration4Join <= MAX_DURATION_FOR_JOIN,
            "duration for join must be less than or equal to MAX_DURATION_FOR_JOIN");

        Game storage game = games[gameId];
        require(game.player == address(0), "game already exists");

        game.player = msg.sender;
        game.opponent = opponent;
        game.bet = msg.value;
        uint deadline4Join = block.timestamp.add(duration4Join);
        game.deadline = deadline4Join;
        emit LogCreateGame(msg.sender, gameId, opponent, msg.value, deadline4Join);
    }

    /*
     * The opponent joins the game providing a clear choice.
     */
    function joinGame(bytes32 gameId, Shape choice) payable public whenNotPaused {
        require(choice != Shape.NONE, "NONE is not an allowed value");

        Game storage game = games[gameId];
        require(game.player != address(0), "game does not exist");
        address opponent = game.opponent;
        require(opponent == msg.sender, "opponent is not the one specified by the player");
        require(game.opponentChoice == Shape.NONE, "opponent is already participating in the game");
        require(block.timestamp <= game.deadline, "deadline for join has expired");

        game.opponentChoice = choice;
        // Set deadline for reveal
        uint deadline4Reveal = block.timestamp.add(duration4Reveal);
        game.deadline = deadline4Reveal;
        // Compute opponent payment
        uint bet = game.bet;
        if (msg.value < bet) {
            asyncWithdrawTo(opponent, bet.sub(msg.value));
        }
        else if (bet < msg.value) {
            asyncPayTo(opponent, msg.value.sub(bet));
        }
        emit LogJoinGame(gameId, choice, msg.value, deadline4Reveal);
    }

    /*
     * The player reveals the hashed choice providing the plain text choice and its secret.
     */
    function revealChoice(Shape choice, bytes32 secret) public whenNotPaused {
        bytes32 gameId = generateGameId(msg.sender, choice, secret);
        Game storage game = games[gameId];
        address player = game.player;
        require(player != address(0), "game does not exist");

        Shape opponentChoice = game.opponentChoice;
        require(opponentChoice != Shape.NONE, "opponent has not yet joined the game");

        require(game.playerChoice == Shape.NONE, "game already finished");
        require(block.timestamp <= game.deadline, "deadline for reveal has expired");

        Shape playerChoice = Shape(choice);
        game.playerChoice = playerChoice;
        Payoff payoff = Payoff((3 + uint(choice) - uint(opponentChoice)) % 3);
        uint bet = game.bet;
        address opponent = game.opponent;
        cleanAndReleaseGame(gameId);

        // Assigns bets to winner or return them in case of draw
        if (payoff == Payoff.TIE) {
            asyncPayTo(player, bet);
            asyncPayTo(opponent, bet);
        }
        else if (payoff == Payoff.PLAYER) {
            asyncPayTo(player, bet.mul(2));
        }
        else if (payoff == Payoff.OPPONENT) {
            asyncPayTo(opponent, bet.mul(2));
        }
        else {
            // It should never happen
            assert(false);
        }
        emit LogRevealChoice(msg.sender, gameId, playerChoice, payoff);
    }

    /*
     * In cases where the opponent doesn't join the game, the player can cancel the game.
     */
    function cancelGame(bytes32 gameId) public whenNotPaused {
        Game storage game = games[gameId];
        address player = game.player;
        require(player != address(0), "game does not exist");
        require(game.opponentChoice == Shape.NONE, "opponent is already participating in the game");
        require(game.deadline < block.timestamp, "deadline for join has not yet expired");
        emit LogCancelGame(msg.sender, gameId);
        uint bet = game.bet;
        cleanAndReleaseGame(gameId);

        // The opponent did not accept the bet
        if (0 < bet) {
            asyncPayTo(player, bet);
        }
    }

    /*
     * In cases where the player doesn't reveal his choice, the opponent can reclaim his bet i.e., the player is
     * penalized.
     */
    function claim(bytes32 gameId) public whenNotPaused {
        Game storage game = games[gameId];
        require(game.player != address(0), "game does not exist");
        require(game.opponentChoice != Shape.NONE, "opponent has not yet joined the game");
        require(game.deadline < block.timestamp, "deadline for reveal has not yet expired");
        uint bet = game.bet;
        address opponent = game.opponent;
        cleanAndReleaseGame(gameId);

        // If it is possible, penalize the player, the opponent is the winner
        if (0 < bet) {
            asyncPayTo(opponent, bet.mul(2));
        }
        emit LogClaim(msg.sender, gameId);
    }

    function cleanAndReleaseGame(bytes32 gameId) private {
        Game storage game = games[gameId];
        game.opponent = address(0);
        game.playerChoice = Shape.NONE;
        game.opponentChoice = Shape.NONE;
        game.bet = 0;
        game.deadline = 0;
        // player slot is used to identify previous games
    }

    function() external payable {
        revert();
    }

    function kill() public fromOwner whenPaused {
        address payable owner = address(uint160(getOwner()));

        emit LogKill(owner);
        selfdestruct(owner);
    }
}
