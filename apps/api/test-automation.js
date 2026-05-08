import mongoose from "mongoose";
import jwt from "jsonwebtoken";

mongoose.connect("mongodb://127.0.0.1:27017/ai-instagram-automation").then(async () => {
  const User = mongoose.connection.collection("users");
  const user = await User.findOne({});
  let token = "";
  if (user) {
    // Application uses sub for user id
    token = jwt.sign({ sub: user._id.toString(), email: user.email, globalRole: "admin" }, "change-me-super-secret-key", { expiresIn: "1d" });
  }
  
  const BASE_URL = "http://localhost:4000/api";
  const BUSINESS_ID = "69eb1ba68a28a8c0d04516ce";
  const IG_ACCOUNT_ID = "69fc8f2972072e810db9924d";
  
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };

  try {
    console.log("2. Testing POST /api/automations");
    const createPayload = {
      businessId: BUSINESS_ID,
      folderIds: ["fake_folder_id_123"],
      folderNames: ["Test Folder"],
      igAccountId: IG_ACCOUNT_ID,
      groupingMode: "batch_size",
      batchSize: 2,
      cadence: { type: "interval", intervalHours: 24 }
    };
    const createRes = await fetch(`${BASE_URL}/automations`, {
      method: "POST", headers, body: JSON.stringify(createPayload)
    });
    console.log("Create status:", createRes.status);
    const createText = await createRes.text();
    console.log(createText);
    
    if (createRes.ok) {
        const createdData = JSON.parse(createText);
        const autoId = createdData.data[0]._id;
        
        console.log("\n3. Testing GET /api/automations");
        const getRes = await fetch(`${BASE_URL}/automations?businessId=${BUSINESS_ID}`, {
          method: "GET", headers
        });
        console.log("List status:", getRes.status, await getRes.text());
        
        console.log("\n4. Testing PATCH /api/automations/:id");
        const patchRes = await fetch(`${BASE_URL}/automations/${autoId}`, {
          method: "PATCH", headers, body: JSON.stringify({ priority: 50 })
        });
        console.log("Patch status:", patchRes.status, await patchRes.text());
    }
  } catch(e) {
      console.error(e);
  }
  process.exit(0);
});
