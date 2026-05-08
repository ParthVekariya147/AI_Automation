const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

mongoose.connect("mongodb://127.0.0.1:27017/ai-instagram-automation").then(async () => {
  const User = mongoose.connection.collection("users");
  const user = await User.findOne({});
  if (user) {
    const token = jwt.sign({ id: user._id.toString(), role: "admin" }, "change-me-super-secret-key", { expiresIn: "1d" });
    console.log("USER:", user._id.toString());
    console.log("TOKEN:", token);
  } else {
    console.log("No user found.");
  }
  
  const Business = mongoose.connection.collection("businesses");
  const business = await Business.findOne({});
  if (business) {
    console.log("BUSINESS:", business._id.toString());
  }

  const IgAcc = mongoose.connection.collection("instagramaccounts");
  const igAcc = await IgAcc.findOne({});
  if (igAcc) {
    console.log("IG_ACCOUNT:", igAcc._id.toString());
  }
  
  process.exit(0);
});
