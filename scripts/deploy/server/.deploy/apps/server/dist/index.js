"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/index.ts
var import_path = __toESM(require("path"));
var import_cors = __toESM(require("cors"));
var import_dotenv = __toESM(require("dotenv"));
var import_express = __toESM(require("express"));
var import_parse_server3 = __toESM(require("parse-server"));
var import_parse_dashboard = __toESM(require("parse-dashboard"));
var import_dotenv_expand = __toESM(require("dotenv-expand"));

// ../../packages/shared/utils/constants.ts
var RolesEnum = /* @__PURE__ */ ((RolesEnum2) => {
  RolesEnum2[RolesEnum2["ADMIN"] = 12308120948] = "ADMIN";
  RolesEnum2[RolesEnum2["MODERATOR"] = 21143141341] = "MODERATOR";
  RolesEnum2[RolesEnum2["AUTHOR"] = 7589243534538] = "AUTHOR";
  RolesEnum2[RolesEnum2["READER"] = 934525757347] = "READER";
  return RolesEnum2;
})(RolesEnum || {});
var classNames = {
  USER: "_User",
  ROLE: "_Role",
  POST: "Post"
};

// src/utils/role.utils.ts
var createRolesIfNotExist = () => __async(void 0, null, function* () {
  const roleEntries = Object.entries(RolesEnum).filter((e) => {
    return Number.isNaN(Number(e[0]));
  });
  for (const entry of roleEntries) {
    const [roleName, roleCode] = entry;
    const roleACL = new Parse.ACL();
    roleACL.setPublicReadAccess(true);
    const foundRole = yield new Parse.Query(Parse.Role).equalTo("name", roleName).first();
    if (foundRole) {
      console.log(`role: '${roleName}' already exists, skipping its creation`);
      if (foundRole.get("code") !== roleCode) {
        console.log(`changing code for role: '${roleName}'`);
        foundRole.set("code", roleCode);
      }
      const index = roleEntries.indexOf(entry);
      if (index > 0) {
        const childRoles = yield foundRole.getRoles().query().find();
        const directChildRole = yield new Parse.Query(Parse.Role).equalTo("name", roleEntries[index - 1][0]).first();
        if (!directChildRole) {
          throw new Error("Something is going wrong!!");
        }
        const hasChildRole = childRoles.find((role2) => {
          return role2.id === directChildRole.id;
        });
        if (!hasChildRole) {
          console.log(`setting child role for role: '${roleName}'`);
          foundRole.getRoles().add(directChildRole);
        }
      }
      if (foundRole.dirty()) {
        yield foundRole.save(null, { useMasterKey: true });
      }
      continue;
    }
    const role = new Parse.Role(roleName, roleACL);
    role.set("code", roleCode);
    yield role.save(null, { useMasterKey: true });
  }
});

// src/schemas/role.schema.ts
var import_parse_server = require("parse-server");
var RoleSchema = import_parse_server.SchemaMigrations.makeSchema(classNames.ROLE, {
  fields: {
    code: { type: "Number" }
  },
  classLevelPermissions: {
    create: {
      "*": true
    },
    find: {
      "*": true
    },
    get: {
      "*": true
    }
  },
  indexes: {}
});
var role_schema_default = RoleSchema;

// src/schemas/post.schema.ts
var import_parse_server2 = require("parse-server");
var PostSchema = import_parse_server2.SchemaMigrations.makeSchema(classNames.POST, {
  fields: {
    // title: { type: 'String' },
    author: { type: "Pointer", targetClass: classNames.USER },
    translations: { type: "Object" },
    slug: { type: "String" }
  },
  classLevelPermissions: {
    create: {
      requiresAuthentication: true
    },
    find: {
      "*": true
    },
    get: {
      "*": true
    },
    update: {
      requiresAuthentication: true
    }
  },
  indexes: {}
});
var post_schema_default = PostSchema;

// src/index.ts
var bootstrap = () => __async(exports, null, function* () {
  global.FORCE_PROD = false;
  global.FORCE_PREPROD = false;
  global.LOCAL = !process.env.ONLINE;
  global.PRODUCTION = Boolean(process.env.PRODUCTION);
  let envFileName = ".env.local";
  if (!global.LOCAL && !global.PRODUCTION || global.FORCE_PREPROD) {
    envFileName = ".env.preprod";
  } else if (global.PRODUCTION || global.FORCE_PROD) {
    envFileName = ".env.production";
  }
  if (global.LOCAL) {
    const envConfig = import_dotenv.default.config({ path: import_path.default.resolve(__dirname, "..", envFileName) });
    import_dotenv_expand.default.expand(envConfig);
  }
  const PORT = Number(process.env.PORT) || 1337;
  const MASTER_KEY = process.env.MASTER_KEY || "local-master-key";
  const DATABASE_URI = process.env.DATABASE_URI || "mongodb://localhost:27017/aktiveo-local";
  const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
  const APP_ID = "aktiveo";
  const app = (0, import_express.default)();
  app.use((0, import_cors.default)({ origin: "*" }));
  app.use(import_express.default.urlencoded({ extended: false }));
  app.use(import_express.default.json());
  const parseServer = new import_parse_server3.default({
    appId: APP_ID,
    masterKey: MASTER_KEY,
    cloud: import_path.default.resolve(__dirname, "./cloud/index"),
    databaseURI: DATABASE_URI,
    serverURL: `${SERVER_URL}/parse`,
    publicServerURL: `${SERVER_URL}/parse`,
    // =============================================
    allowClientClassCreation: false,
    schema: {
      strict: true,
      definitions: [role_schema_default, post_schema_default]
    },
    masterKeyIps: ["0.0.0.0/0", "::1"],
    allowExpiredAuthDataToken: false
  });
  yield parseServer.start();
  app.use("/parse", parseServer.app);
  if (global.LOCAL) {
    const dashboard = new import_parse_dashboard.default(
      {
        apps: [
          {
            serverURL: `${SERVER_URL}/parse`,
            // ! localhost only
            appId: APP_ID,
            masterKey: MASTER_KEY,
            appName: "Aktiveo Express Dash Local"
          }
        ]
      },
      {
        // allowInsecureHTTP: false,
        port: PORT
      }
    );
    app.use("/pdash", dashboard);
  }
  app.listen(PORT, () => {
    console.log("====================================");
    console.log(`   server running on port ${PORT}   `);
    console.log("====================================");
  });
  createRolesIfNotExist();
});
bootstrap();
//# sourceMappingURL=index.js.map
