const { firebaseAuth } = require("../lib/firebase");

/**
 *
 * @param {import("aws-lambda").APIGatewayRequestAuthorizerEventV2} event
 * @returns
 */
const authorizer = async function (event) {
    const routeArn = event.routeArn;

    let encodedToken = event.headers?.authorization || event.headers?.Authorization;
    if (!encodedToken) {
        console.log("No authorization token provided");
        return denyPolicy("No authorization token provided");
    }
    encodedToken = encodedToken.replace("Bearer ", "");

    try {
        const claims = await firebaseAuth.verifyIdToken(encodedToken);
        console.log(claims);
        if ((!claims.is2faVerified || !(claims.emailVerified || claims.email_verified)) && claims.isAdmin) {
            console.log("User has not yet completed 2fa or email verification");
            return denyPolicy("User has not yet completed 2fa or email verification");
        }
        return allowPolicy(routeArn, claims);
    }
    catch (error) {
        console.log(error);
        return denyPolicy(error.message);
    }
};

exports.handler = authorizer;

/**
 * @param {String} [message]
 */
function denyPolicy (message = "You are not authorized to access this resource") {
    return {
        principalId: "*",
        policyDocument: {
            Version: "2012-10-17",
            Statement: [{
                Action: "*",
                Effect: "Deny",
                Resource: "*"
            }]
        }
    };
}

function allowPolicy (routeArn, decodedToken) {
    return {
        principalId: "apigateway.amazonaws.com",
        policyDocument: {
            Version: "2012-10-17",
            Statement: [{
                Action: "execute-api:Invoke",
                Effect: "Allow",
                Resource: routeArn
            }]
        },
        context: {
            decodedToken: JSON.stringify(decodedToken)
        }
    };
}