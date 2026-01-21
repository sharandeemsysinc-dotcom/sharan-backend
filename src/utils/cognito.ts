import axios from "axios";
import qs from "qs";

export async function exchangeCodeForTokens(code: string) {
  const tokenUrl = `${process.env.COGNITO_DOMAIN}/oauth2/token`;

  const body = qs.stringify({
    grant_type: "authorization_code",
    client_id: process.env.COGNITO_CLIENT_ID,
    code,
    redirect_uri: process.env.COGNITO_REDIRECT_URI,
  });

  const authHeader = Buffer.from(
    `${process.env.COGNITO_CLIENT_ID}:${process.env.COGNITO_CLIENT_SECRET}`
  ).toString("base64");

  const res = await axios.post(tokenUrl, body, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${authHeader}`,
    },
  });

  return res.data;
}

export async function getUserInfo(accessToken: string) {
  const url = `${process.env.COGNITO_DOMAIN}/oauth2/userInfo`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return res.data;
}
