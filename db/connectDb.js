import mongoose from 'mongoose';

const connect = async () => {
  try {
    await mongoose.connect(`${process.env.MONGO_DB_URL}`);
    console.log('Successfully connected with the Database 👍👌');
  } catch (error) {
    console.error('something went wrong ❌', error);
  }
};

mongoose.connection.on('disconnected', () => {
  console.log('mongoDB disconnected');
});
mongoose.connection.on('connected', () => {
  console.log('mongoDB connected');
});

export default connect;
