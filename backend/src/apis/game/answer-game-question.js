const { dynamoDocClient } = require("../../lib/dynamoDB");
const { GetCommand, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { firebaseAuth } = require("../../lib/firebase");
const { sendHTTPResponse } = require("../../lib/api");
const middy = require("@middy/core");
const httpJsonBodyParser = require("@middy/http-json-body-parser");
const httpEventNormalizer = require("@middy/http-event-normalizer");
const { v4: uuidv4 } = require("uuid");
const { sendMessageToSNSTopic } = require("../../lib/sns");

const { BigQuery } = require("@google-cloud/bigquery");

const serviceAccount = {
    type: "service_account",
    project_id: "trivia-titans-sdp-16",
    private_key_id: "a42b2558703c8c5127e6ab5fc69da2ee6f5fffa6",
    private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCpwFvkW14RXgCA\nW0SBFKAzquDRjkr2hM9D3YDY/Vc23nQkkaouD9Sl72EHdhiLEU4sWxnt8s8ID4ob\nUmMN1UJU4eP2NmVMoC29WfMNXLK6lX3tUVvexDX1MwKRmbRr41NDrZbBh3V/OUV7\nAbYGN7gnXbt/YPLPzqJCzj1Xt/1pvx6bxgT7CKE/h1i3d52YhpWhTh23Og793k7I\nGQoXTZETw8jsTkShYFNGTZqAzfzXwpZzo+OpmzqN6EvkB4rxSUOF3lTFar0Lvg+w\nwRxGwIHG1/uQrR5V1QjC80PPuhFS/xC4dGievSyZEr1v3KlucL9fM0XFaZZNiMsF\nq0swkwx5AgMBAAECggEAAgU0EsezmulPgDeV3SNttK+39UaIRd7WyKv+OJbrTs/e\n+gBx0hKGKWNr+DbDnAQcthJvgJF/PU1SC3kzjJqZK4F0wR1snzjY0oQbjHEp/2aA\nFS7+tOwI6F4vDaSSrSYLe6a5QJxoHZeE6C3hCLnpCy7maGGzAh4neDwUJtMdxQBo\nWSY2U6L/P8gcGLhvOCtdBFu4EAwiPJcIk8hEKw4tOtRtorjcySojh52EpLQPz9jA\neVJ/XeUWvzhslDDgjQSWE1ox6C3+hp5C4b2Y4rEKaeptDb1V7HvzvA5aKSN7hbjU\nqVz1taROaTdER5GwGqKpYWQ+zu5RGHwQyn8KoHhvcQKBgQDacKPG+L8S5m+SBg2g\nY2sGrZRyLGXfYWQhe2urHvn7jOWSlqPuqweAMzGQrvanZj5r3+2pVcbex/R6Asdp\nD7cEBaZ5YBPq44KaHCASOtT1P12rwzn6yPi4J6C0qVN4IWb3pE98VBCtu4RrNYVx\nyqvoHqW9Ck6tYtbqkHAAPpizRwKBgQDG8IeAWx/pVV1lRZalDOAXk6XW8SoVHgeU\nFpMhfXbvx/cAya+/oq3uEXPplThQOOFFdyrXvLSj4HsbMiriPmiJCfm9vASJwELY\nCqAtZd9e7EoTW8NU1xNhq7RLDOr58nZ+wjebWxQw6NIY2IvWYohyJcNLTHV8WJcz\nozw8qhSiPwKBgA9Ky2xmhZnhH/ZtDg8oZpm1FStZCFi3DLd7WHJGXOHLX1b/zMIs\nnv3Ol621UfcuJTiQGKc+Jgn6nZbdEvC79OgHLTxaCYrsGnyHc4dTLw1sPjaEGE8C\nOsdJnuqG4B0M2ZSEoDvn9rLy6bZHrOvmcFpzqs6tJgzlWn5ZVj3uI+qJAoGBAIbw\nPajVpnaZnYkEw6Lecd3sG1AJMtcyEEflbBUKSjNoemVBaIFe8gUKN4pX2eOoQTzi\nEOBWslx59mbDB42AcV2Ks6h7sMRS8cQiqPVCJVn4gmJRGtQgMphMZDWH5JZ3XOKs\nEBXDmJV4RpHtyCQ5n311mdsoWIRoft7auRAY+Xf3AoGAC9BYaRnOR0Mt0mvGf5KQ\nNf+GGo5TvsqtdjtuSX+XHc5Wl9YiUnzL8bYedZNHN4ehLPIGLKeoSWh3rR35cSX0\nlUX3cNTRFtyl2Qb19sxoZ2gMf3Uv/Qnx+zxpKDts2qkOMYAuM/nxNTZRYzsRXvga\nZV2UIeXCD3iYSJo0fbLTdSU=\n-----END PRIVATE KEY-----\n",
    client_email: "looker-dumper@trivia-titans-sdp-16.iam.gserviceaccount.com",
    client_id: "113369465364210383135",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/looker-dumper%40trivia-titans-sdp-16.iam.gserviceaccount.com",
    universe_domain: "googleapis.com"
};


const bqClient = new BigQuery({
    credentials: serviceAccount
});

const timePerQuestionInSeconds = 30;
const timeToShowAnswerInSeconds = 10;

const handler = async (event) => {
    try {
        // @ts-ignore
        const { gameId } = event.pathParameters;
        const { questionNumber, answer, teamId } = event.body;

        const firebaseToken = event.headers.authorization;
        /**
         * @type {import("firebase-admin/auth").DecodedIdToken}
         */
        const claims = await firebaseAuth.verifyIdToken(firebaseToken.replace("Bearer ", ""));

        const requestTime = new Date();

        const getGameCommand = new GetCommand({
            TableName: "GameQuestions",
            Key: {
                gameId,
            },
        });

        const getGameResult = await dynamoDocClient.send(getGameCommand);

        /**
         * @typedef {object} Question
         * @property {string} category
         * @property {string} correctAnswer
         * @property {string} difficulty
         * @property {string} explaination
         * @property {string} id
         * @property {Array<string>} options
         * @property {string} question
         * @property {Array<string>} tags
         */

        /**
         * @typedef {object} Game
         * @property {string} gameId
         * @property {string} category
         * @property {string} difficulty
         * @property {string} gameName
         * @property {Array<Question>} questions
         * @property {string} startTime
         */

        /**
         * @type {Game}
         */

        // @ts-ignore
        const game = getGameResult.Item;

        if (!game) {
            return sendHTTPResponse(404, { error: "Game not found." });
        }

        if (game.questions.length < questionNumber) {
            return sendHTTPResponse(404, { error: "Question not found." });
        }

        const startTime = new Date(game.startTime);
        const endTime = new Date(startTime.getTime() + (game.questions.length * (timePerQuestionInSeconds + timeToShowAnswerInSeconds) * 1000));

        if (requestTime < startTime) {
            return sendHTTPResponse(400, { error: "Game has not started yet." });
        }

        if (requestTime >= endTime) {
            return sendHTTPResponse(400, { error: "Game has ended." });
        }

        const questionStartTime = new Date(startTime.getTime() + ((questionNumber - 1) * (timePerQuestionInSeconds + timeToShowAnswerInSeconds) * 1000));
        const questionEndTime = new Date(questionStartTime.getTime() + (timePerQuestionInSeconds * 1000));

        if (requestTime < questionStartTime) {
            return sendHTTPResponse(400, { error: "Question has not started yet." });
        }

        if (requestTime >= questionEndTime) {
            return sendHTTPResponse(400, { error: "Question has ended." });
        }

        const question = game.questions[questionNumber - 1];
        const getGameAnswerCommand = new ScanCommand({
            TableName: "game-answers",
            FilterExpression: "gameId = :gameId AND userId = :userId AND questionId = :questionId",
            ExpressionAttributeValues: {
                ":gameId": gameId,
                ":userId": claims.uid,
                ":questionId": question.id
            }
        });

        const getGameAnswerResult = await dynamoDocClient.send(getGameAnswerCommand);

        if (getGameAnswerResult.Items.length > 0) {
            return sendHTTPResponse(400, { error: "You have already answered this question." });
        }

        const getTeamCommand = new GetCommand({
            TableName: "teams",
            Key: {
                id: teamId
            }
        });

        const getTeamResult = await dynamoDocClient.send(getTeamCommand);

        if (!getTeamResult.Item) {
            return sendHTTPResponse(404, { error: "Team not found." });
        }

        /**
         * @typedef {Object} Member
         * @property {string} userId
         * @property {string} userEmail
         * @property {string} role
         * @property {string} status
         */
        /**
         * @typedef {Object} Team
         * @property {string} id
         * @property {string} teamName
         * @property {Array<Member>} members
         */

        /**
         * @type {Team}
         */
        // @ts-ignore
        const team = getTeamResult.Item;

        const gameAnswer = {
            id: uuidv4(),
            gameId,
            teamId,
            teamName: team.teamName,
            userId: claims.uid,
            userName: claims.name,
            questionId: question.id,
            timestamp: requestTime.toISOString(),
            correctAnswer: question.correctAnswer,
            answer,
            category: question.category,
            points: 0
        };

        if (question.correctAnswer === answer) {
            gameAnswer.points = 1 / team.members.filter(member => member.status === "accepted").length;
        }

        const putGameAnswerCommand = new PutCommand({
            TableName: "game-answers",
            Item: gameAnswer
        });

       await dynamoDocClient.send(putGameAnswerCommand);
        
        const topicArn = `arn:aws:sns:us-east-1:${process.env.AWS_ACCOUNT_ID || event.requestContext.accountId}:UserAchievementsSNSTopic`;
        console.log(topicArn);
        await sendMessageToSNSTopic(topicArn, {
            TableName: "game-answers",
            Item: gameAnswer
        });

        try {
            const datasetId = "game_statistics";
            const tableId = "answer-data";
            const dataset = bqClient.dataset(datasetId);
            const table = dataset.table(tableId);

            const dataToInsert = [
                gameAnswer
            ];

            const options = { ignoreUnknownValues: true };
            const [apiResponse] = await table.insert(dataToInsert, options);
            console.log("Data successfully inserted into BigQuery:", apiResponse);
        }
        catch (error) {
            console.error("Error processing record:", error);
        }

        return sendHTTPResponse(200, { message: `The answer ${answer} has been recorded.` });
    }
    catch (error) {
        console.log(error);
        return sendHTTPResponse(500, { error: "Something went wrong." });
    }
};

// @ts-ignore
module.exports = { handler: middy(handler).use(httpJsonBodyParser()).use(httpEventNormalizer()) };
