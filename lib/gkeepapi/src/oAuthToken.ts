import fetch from "node-fetch";

export async function getOAuthToken(Email: string, EncryptedPasswd: string) {
  const body = new URLSearchParams({
    accountType: "HOSTED_OR_GOOGLE",
    Email,
    has_permission: "1",
    EncryptedPasswd,
    service:
      "oauth2:https://www.googleapis.com/auth/memento https://www.googleapis.com/auth/reminders",
    source: "android",
    androidId: "123",
    app: "com.google.android.keep",
    client_sig: "38918a453d07199354f8b19af05ec6562ced5788",
    device_country: "us",
    operatorCountry: "us",
    lang: "en",
    sdk_version: "17",
  }).toString();

  // Let fetch set Content-Length automatically to avoid undici length mismatch errors
  const headers = {
    Host: "android.clients.google.com",
    "User-Agent": "GoogleAuth/1.4",
    "Accept-Encoding": "identity",
    Accept: "*/*",
    Connection: "keep-alive",
    "Content-type": "application/x-www-form-urlencoded",
  };

  const resp = await fetch("https://android.clients.google.com/auth", {
    method: "POST",
    headers,
    body,
  });
  const txt = (await resp.text()).split("\n");
  const obj = txt.reduce(
    (o, key) => Object.assign(o, { [key.split("=")[0]]: key.split("=")[1] }),
    {}
  ) as { Auth: string };

  return obj.Auth;
}
