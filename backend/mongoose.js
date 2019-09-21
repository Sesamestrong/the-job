module.exports = new Promise((resolve, reject) => {
  const bcrypt = require("bcrypt");
  const mongoose = require("mongoose");
  const saltshaker = require("randomstring").generate;
  const jwt = require("jsonwebtoken");

  const SALT_ROUNDS = 12;

  require("dotenv").config();
  const privateKey = saltshaker();

  mongoose.connect(process.env.DATABASE.replace(/<password>/, process.env.PASSWORD), {
    useNewUrlParser: true
  });
  const db = mongoose.connection;

  //Model declaration go here
  let User, Snip, UserRole;

  const {
    ObjectId
  } = mongoose.Schema.Types;
  //Schema initializations go here
  const users = new mongoose.Schema({
    username: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    snipIds: [{
      type: ObjectId,
      required: true,
      ref: 'User',
    }],
  });

  users.statics.create = async function({
    username,
    password
  }) {
    const hashPassword = await bcrypt.hash(password, SALT_ROUNDS);
    if (await User.findOne({
        username
      })) throw "User already exists";
    const user = new User({
      username,
      password: hashPassword,
      snipIds: []
    });
    await user.save();
    return user;
  };

  users.statics.validate = async function({
    username,
    password
  }) {
    const user = await User.findOne({
      username
    });
    if (!user) throw "User not found";
    if (await bcrypt.compare(password, user.password))
      return user;
    throw "Invalid password";
  };

  users.methods.genToken = function() {
    return new Promise((resolve, reject) => {
      jwt.sign({
        _id: this._id,
      }, privateKey, {
        expiresIn: '2h'
      }, function(err, token) {
        return err ? reject(err) : resolve(token);
      });
    });
  };

  const snips = new mongoose.Schema({
    name: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    ownerId: {
      type: ObjectId,
      required: true,
      ref: 'User',
    },
    roleIds: [{
      type: ObjectId,
      required: true,
      ref: 'UserRole',
    }],
    public: {
      type: Boolean,
      required: true,
    },
  });

  snips.statics.create = async function({
    name,
    public,
    _id
  }) {
    const user = await User.findById(_id);
    const snipNames = await Promise.all(user.snipIds.map(async snipId => (await Snip.findById(snipId)).name));
    if (snipNames.includes(name)) throw "The user already has a snip with the name requested.";
    const snip = new Snip({
      name,
      public,
      content: "//Start Snip here",
      ownerId: _id,
      roleIds: []
    });
    user.snipIds = [...user.snipIds, snip._id];
    return await new Promise((resolve, reject) => snip.save((err, snip) => err ? reject(err) : user.save((err, user) => err || !user ? reject(err) : resolve(snip))));
  };

  const roleNames = ['OWNER', 'EDITOR', 'READER'];
  const userRoles = new mongoose.Schema({
    userId: {
      type: ObjectId,
      required: true,
      ref: 'User',
    },
    role: {
      type: String,
      required: true,
      enum: roleNames,
    },
  });

  userRoles.methods.toNum = function() {
    return roleNames.indexOf(this.role);
  };

  snips.methods.userHasRole = async function({
    _id,
    role
  }) {
    const roleNum = roleNames.indexOf(role);
    return this.ownerId == _id || (await Promise.all(
      this.roleIds.map(async roleId => (userRole => userRole.userId == _id && roleNum >= userRole.toNum())(await UserRole.findById(roleId))))).reduce((last, next) => last || next, false);
  };
  snips.methods.setContent = function({
    newContent
  }) {
    this.content = newContent;
    return new Promise((resolve, reject) => this.save((err, snip) => err || !snip ? reject(err) : resolve(snip)));
  };
  snips.methods.setUserRole = async function({
    _id,
    role
  }) {
    let existentRole = (await Promise.all(this.roleIds.map(async roleId => (role => role.userId+"" == _id && role)(await UserRole.findById(roleId)), undefined))).filter(i => i)[0];
    if (existentRole)
      existentRole.role = role;
    else
    {
      existentRole = new UserRole({
        userId: _id,
        role
      });
      this.roleIds = [...this.roleIds, existentRole._id];
    }

    return new Promise((resolve, reject) => existentRole.save((err, userRole) => err || !userRole ? reject(err) : this.save((err, snip) => err || !snip ? reject(err) : resolve(userRole))));
  };
  /*const roleToLevel = {
    "read": 1,
    "write": 2,
    "own": 3,
  };
  const highestLevel = Math.max(Object.values(roleToLevel));
  //Switch all keys and values in roleToLevel
  const levelToRole = Object.keys(roleToLevel).filter((obj, next) => ({ ...obj,
    [roleToLevel[next]]: next
  }));

  snips.methods.userHasRole = async function({
    role,
    _id
  }) {
    console.log("Started looking for role");
    if(this.public&&role==="read") return true;
    console.log("Got past public");
    if(!_id) return false;
    if(_id===this.ownerId+"") return true;
    console.log("Did not match ownerId");
    const authorizationLevel = roleToLevel[role];
    if (!authorizationLevel) throw "Unknown role";
    const isAuthorized = false;
    for (let i = authorizationLevel; i < highestLevel && !isAuthorized; i++)
      isAuthorized = isAuthorized || this[levelToRole[i]].includes(_id);
    console.log("Authorized is",isAuthorized);
    return isAuthorized;
  }
  */

  db.on("error", err => reject(err));
  db.on("open", () => {
    console.log("Connected");

    //Model initializations go here
    User = mongoose.model('User', users);
    Snip = mongoose.model('Snip', snips);
    UserRole = mongoose.model('UserRole', userRoles);

    resolve({
      models: {
        //Models go here
        User,
        Snip,
        UserRole,
      },
      privateKey,
    });

  });
});
