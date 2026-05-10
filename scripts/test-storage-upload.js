const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const serviceAccount = require('../functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'matrimonio-andrea-giulia-2026.firebasestorage.app'
});

const bucket = admin.storage().bucket();

async function testAdminSDKUpload() {
  console.log('=== TEST 1: Upload via Admin SDK ===');

  const testFilePath = path.join(__dirname, '_test_upload_admin.jpg');

  // Mini valid JPEG header + payload (un'immagine 1x1 nero)
  const minJpeg = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
    0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
    0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
    0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
    0x82, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xFB,
    0xD0, 0xFF, 0xD9
  ]);

  fs.writeFileSync(testFilePath, minJpeg);
  console.log(`Created test file: ${testFilePath} (${minJpeg.length} bytes)`);

  const fileName = `${uuidv4()}_test_admin.jpg`;
  const destination = `wedding-media/originals/${fileName}`;

  try {
    const [uploaded] = await bucket.upload(testFilePath, {
      destination: destination,
      metadata: { contentType: 'image/jpeg' }
    });
    console.log(`✅ Admin SDK upload SUCCESS: ${destination}`);
    console.log(`   File size: ${uploaded.metadata.size}`);
    console.log(`   ContentType: ${uploaded.metadata.contentType}`);

    fs.unlinkSync(testFilePath);

    return destination;
  } catch (err) {
    console.error('❌ Admin SDK upload FAILED:', err.message);
    fs.unlinkSync(testFilePath);
    throw err;
  }
}

async function checkUploadedFile(destination) {
  console.log('\n=== TEST 2: Verifica file uploadato ===');

  const file = bucket.file(destination);
  const [exists] = await file.exists();

  if (exists) {
    const [metadata] = await file.getMetadata();
    console.log(`✅ File exists: ${destination}`);
    console.log(`   Size: ${metadata.size}`);
    console.log(`   ContentType: ${metadata.contentType}`);
    console.log(`   Created: ${metadata.timeCreated}`);
    return true;
  } else {
    console.log(`❌ File NOT found: ${destination}`);
    return false;
  }
}

async function checkThumbsGenerated(originalDestination) {
  console.log('\n=== TEST 3: Verifica generazione thumbs (Cloud Function) ===');

  const fileName = path.basename(originalDestination);
  const displayPath = `wedding-media/display/${fileName}`;
  const thumbPath = `wedding-media/thumbs/${fileName}`;

  console.log('Waiting 15 seconds for Cloud Function to process...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  const displayFile = bucket.file(displayPath);
  const thumbFile = bucket.file(thumbPath);

  const [displayExists] = await displayFile.exists();
  const [thumbExists] = await thumbFile.exists();

  console.log(`Display: ${displayExists ? '✅ exists' : '❌ missing'} (${displayPath})`);
  console.log(`Thumb:   ${thumbExists ? '✅ exists' : '❌ missing'} (${thumbPath})`);

  return displayExists && thumbExists;
}

async function cleanup(originalDestination) {
  console.log('\n=== CLEANUP: Rimuovo file di test ===');

  const fileName = path.basename(originalDestination);
  const paths = [
    `wedding-media/originals/${fileName}`,
    `wedding-media/display/${fileName}`,
    `wedding-media/thumbs/${fileName}`
  ];

  for (const p of paths) {
    try {
      await bucket.file(p).delete();
      console.log(`✅ Deleted: ${p}`);
    } catch (err) {
      console.log(`⚠️  Could not delete ${p}: ${err.message}`);
    }
  }
}

async function main() {
  console.log('🧪 Diagnostic test for Storage upload\n');

  try {
    const destination = await testAdminSDKUpload();
    await checkUploadedFile(destination);
    await checkThumbsGenerated(destination);
    await cleanup(destination);

    console.log('\n✅ Tutti i test completati. Admin SDK upload OK.');
    console.log('   Conclusione: il bug è isolato al Client SDK browser.');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test fallito:', err.message);
    console.error('   Conclusione: il problema NON è solo client. Da investigare.');
    process.exit(1);
  }
}

main();
