"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// ../../packages/shared/utils/constants.ts
var I18N_LOCALE_KEY;
var init_constants = __esm({
  "../../packages/shared/utils/constants.ts"() {
    I18N_LOCALE_KEY = "xxx-app-i18n-locale";
  }
});

// ../../packages/shared/i18n/locales/en/common.json
var common_default;
var init_common = __esm({
  "../../packages/shared/i18n/locales/en/common.json"() {
    common_default = {
      hello: "Hello",
      actionRequireAuth: "You need to be authenticated to perform this action",
      insufficientRoleForAction: "Your roles does not permit to perform this action",
      userHasNoEmail: "User has no email",
      roleNotFound: "Role not found"
    };
  }
});

// ../../packages/shared/i18n/locales/en/index.ts
var namespaces, en_default;
var init_en = __esm({
  "../../packages/shared/i18n/locales/en/index.ts"() {
    "use strict";
    init_common();
    namespaces = {
      common: common_default
    };
    en_default = namespaces;
  }
});

// ../../packages/shared/i18n/locales/fr/common.json
var common_default2;
var init_common2 = __esm({
  "../../packages/shared/i18n/locales/fr/common.json"() {
    common_default2 = {
      hello: "Bonjour",
      actionRequireAuth: "Vous devez \xEAtre authentifi\xE9 pour effectuer cette action",
      insufficientRoleForAction: "Vos r\xF4les ne permettent pas d'effectuer cette action",
      userHasNoEmail: "L'utilisateur n'a pas d'email",
      roleNotFound: "Role introuvable"
    };
  }
});

// ../../packages/shared/i18n/locales/fr/index.ts
var namespaces2, fr_default;
var init_fr = __esm({
  "../../packages/shared/i18n/locales/fr/index.ts"() {
    "use strict";
    init_common2();
    namespaces2 = {
      common: common_default2
    };
    fr_default = namespaces2;
  }
});

// ../../packages/shared/i18n/resources.ts
var resources, NS, defaultNS, defaultLocale;
var init_resources = __esm({
  "../../packages/shared/i18n/resources.ts"() {
    init_en();
    init_fr();
    resources = {
      en: en_default,
      fr: fr_default
    };
    NS = Object.keys(fr_default);
    defaultNS = "common";
    defaultLocale = "en";
  }
});

// src/utils/i18n.ts
var import_i18next, getT;
var init_i18n = __esm({
  "src/utils/i18n.ts"() {
    "use strict";
    import_i18next = __toESM(require("i18next"));
    init_resources();
    import_i18next.default.init({
      debug: false,
      // debug: process.env.NODE_ENV === 'development',
      resources,
      compatibilityJSON: "v3",
      fallbackLng: defaultLocale,
      ns: NS,
      defaultNS,
      interpolation: {
        escapeValue: false
        // not needed for react as it escapes by default
      }
    });
    getT = (locale) => {
      return import_i18next.default.getFixedT(locale);
    };
  }
});

// src/utils/parse.utils.ts
var parseFunction, hasRole, parseFrom, parseTrigger;
var init_parse_utils = __esm({
  "src/utils/parse.utils.ts"() {
    "use strict";
    init_constants();
    init_resources();
    init_i18n();
    parseFunction = (innerFunction) => {
      return (req) => __async(void 0, null, function* () {
        try {
          let result = yield innerFunction(req);
          if (result == null) {
            result = "ok";
          }
          return result;
        } catch (error) {
          if (global.LOCAL) {
            console.trace(error);
          }
          let message;
          if (error && "message" in error) {
            message = error.message;
          } else {
            message = "Unknown error";
          }
          return Promise.reject(message);
        }
      });
    };
    hasRole = (user, roles) => __async(void 0, null, function* () {
      const foundRole = yield new Parse.Query(Parse.Role).equalTo("users", user).containedIn("code", roles).first({ useMasterKey: true });
      return !!foundRole;
    });
    parseFrom = (params) => {
      const actionBuilder = parseFunction((req) => __async(void 0, null, function* () {
        const { requireUser, action, allowedRoles } = params;
        const { user, headers } = req;
        const locale = headers[I18N_LOCALE_KEY];
        const t = getT(locale || defaultLocale);
        if (!requireUser) {
          return action({ req, t });
        }
        if (!user) {
          throw new Error(t("common:actionRequireAuth"));
        }
        const userHasRole = yield hasRole(user, allowedRoles);
        if (!userHasRole) {
          throw new Error(t("common:insufficientRoleForAction"));
        }
        return action({ req, user, t });
      }));
      return actionBuilder;
    };
    parseTrigger = (params) => {
      const triggerBuilder = parseFunction((req) => __async(void 0, null, function* () {
        const { trigger } = params;
        const { headers } = req;
        const locale = headers[I18N_LOCALE_KEY];
        const t = getT(locale || defaultLocale);
        return trigger({ req, t });
      }));
      return triggerBuilder;
    };
  }
});

// src/cloud/functions/index.ts
var require_functions = __commonJS({
  "src/cloud/functions/index.ts"(exports) {
    "use strict";
    init_constants();
    init_parse_utils();
    Parse.Cloud.define(
      "hello",
      parseFrom({
        requireUser: true,
        allowedRoles: [12308120948 /* ADMIN */, 21143141341 /* MODERATOR */, 7589243534538 /* AUTHOR */, 934525757347 /* READER */],
        // allowedRoles: [],
        action: (_0) => __async(exports, [_0], function* ({ t }) {
          return t("common:hello");
        })
      })
    );
  }
});

// src/utils/constants.ts
var ADMIN_EMAILS;
var init_constants2 = __esm({
  "src/utils/constants.ts"() {
    "use strict";
    ADMIN_EMAILS = ["radandevist@gmail.com"];
  }
});

// src/utils/role.utils.ts
function findRoleByCode(code, useMasterKey = false) {
  return __async(this, null, function* () {
    const roleQuery = new Parse.Query(Parse.Role);
    return roleQuery.equalTo("code", code).first({ useMasterKey });
  });
}
var assignRoleToUser;
var init_role_utils = __esm({
  "src/utils/role.utils.ts"() {
    "use strict";
    init_constants();
    assignRoleToUser = (user, role, useMasterKey = false) => __async(void 0, null, function* () {
      const relation = role.getUsers();
      relation.add(user);
      return role.save(null, { useMasterKey });
    });
  }
});

// src/cloud/triggers/user.triggers.ts
var require_user_triggers = __commonJS({
  "src/cloud/triggers/user.triggers.ts"(exports) {
    "use strict";
    init_constants();
    init_constants2();
    init_parse_utils();
    init_role_utils();
    Parse.Cloud.afterSave(
      Parse.User,
      parseTrigger({
        trigger: (_0) => __async(exports, [_0], function* ({ req, t }) {
          const user = req.object;
          const email = user.getEmail();
          if (!email) {
            throw new Error(t("common:userHasNoEmail"));
          }
          if (ADMIN_EMAILS.includes(email)) {
            const adminRole = yield findRoleByCode(12308120948 /* ADMIN */, true);
            if (!adminRole) {
              throw new Error(t("common:roleNotFound"));
            }
            yield assignRoleToUser(user, adminRole, true);
          }
        })
      })
    );
  }
});

// src/cloud/triggers/session.triggers.ts
var require_session_triggers = __commonJS({
  "src/cloud/triggers/session.triggers.ts"(exports) {
    "use strict";
    init_parse_utils();
    Parse.Cloud.afterLogin(
      parseTrigger({
        trigger: (_0) => __async(exports, [_0], function* ({ req }) {
          console.log("====================================");
          console.log(req.headers);
          console.log("====================================");
        })
      })
    );
  }
});

// src/cloud/index.ts
var import_functions = __toESM(require_functions());

// src/cloud/triggers/index.ts
var import_user = __toESM(require_user_triggers());
var import_session = __toESM(require_session_triggers());
//# sourceMappingURL=index.js.map
