import { usesApiKey } from "../catalog";
import { preferApi } from "../engine";
import api from "./api";
import web from "./web";

export default preferApi(web, api, (settings) => usesApiKey(settings.engineConfig, "papago"));
