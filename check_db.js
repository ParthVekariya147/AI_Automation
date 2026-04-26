import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { MediaAssetModel } from './apps/api/src/models/MediaAsset.js';

dotenv.config({ path: './apps/api/.env' });

async function checkDb() {
  await mongoose.connect(process.env.MONGODB_URI);
  const assets = await MediaAssetModel.find({ folderName: 'IG_post' });
  console.log(`Found ${assets.length} assets with folderName "IG_post"`);
  if (assets.length > 0) {
    console.log('Sample asset:', assets[0]);
  }
  process.exit(0);
}

checkDb().catch(err => {
  console.error(err);
  process.exit(1);
});
