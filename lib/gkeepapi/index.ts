import { ColorValue } from "./src/types.d";
import Keep from "./src";

const keep = new Keep.default(
  process.env.email,
  process.env.encrypted_password
);

const lists = await keep.allLists();
const list = lists.find((list) => list.title.includes("Todo today"));
list.color = ColorValue.Blue;
list.title = "Todo today";
await list.save();
console.log(list.toString());
