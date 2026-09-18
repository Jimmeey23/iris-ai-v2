import 'dotenv/config';
const {syncTrainerReviews}=await import('../../src/lib/trainer-reviews.ts');
const r=await syncTrainerReviews();
console.log(JSON.stringify(r,null,1));
process.exit(0);
