import 'dotenv/config'
import { db } from './src/prisma/db';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import walletRoutes from './src/routes/wallet.routes';


const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());

//post requests
app.use('/api', walletRoutes);

app.get('/', (req, res) => {
    res.send("Hello Swiftbuck api at your service");
})
app.get('/health', (req, res) => {
    res.send("Swiftbuck api is healthy");
})

const PORT = process.env.PORT || 4000;

//await db connect

await db.connect();
app.listen(PORT, ()=>{
    console.log("Server is running quieltly on port " + PORT)
})

