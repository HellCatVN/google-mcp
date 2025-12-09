import { oauthTools } from "./oauth/index";
import { calendarTools } from "./calendar/index";
import { gmailTools } from "./gmail/index";
import { driveTools } from "./drive/index";
import { tasksTools } from "./tasks/index";
import { unofficialKeepTools } from "./unofficial/keep/index";

const tools = [
  // OAuth tools
  ...oauthTools,

  // Calendar tools
  ...calendarTools,

  // Gmail tools
  ...gmailTools,

  // Google Drive tools
  ...driveTools,

  // Google Tasks tools
  ...tasksTools,

  // Google Keep (unofficial) tools
  ...unofficialKeepTools,
];

export default tools;
