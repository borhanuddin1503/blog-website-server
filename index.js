require('dotenv').config()
const express = require('express')
const app = express()
var cookieParser = require('cookie-parser');
const cors = require('cors')
const port = process.env.PORT || 3000;

// middlewares
app.use(cors());
app.use(express.json());
app.use(cookieParser());


// firebase token setup
var admin = require("firebase-admin");

var serviceAccount = require("./firebase-token-key.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


// firebase token verification
const firebaseTokenVerification = async (req, res, next) => {
    try {
        const authorizationHeader = req.headers.authorization;

        if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
            return res.status(401).send({ message: 'Unauthorized: Token missing or invalid format' });
        }

        const token = authorizationHeader.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(token);

        req.firebaseEmail = decoded.email;
        next();
    } catch (error) {
        return res.status(401).send({ message: 'Unauthorized: Invalid token' });
    }
};





// mongodb application code
const { MongoClient, ServerApiVersion, MongoCryptKMSRequestNetworkTimeoutError, Db, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.pn4qknt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");

        // creat database and collection
        const blogsCollection = client.db('blogs_website').collection('blogs');
        const wishListCollection = client.db('blogs_website').collection('wishList');
        const commentsCollection = client.db('blogs_website').collection('comments')

        // post blog
        app.post('/blogs', firebaseTokenVerification, async (req, res) => {
            const blogData = req.body;
            if (blogData.email !== req.firebaseEmail) {
                return res.status(403).send({ message: "Forbidden Access" })
            }
            const result = await blogsCollection.insertOne(blogData);
            res.send(result);
        })


        // get blog
        app.get('/allblogs', async (req, res) => {
            const query = req.query.search;
            const category = req.query.category;

            let filter = {};

            if (query) {
                filter = { title: { $regex: query, $options: 'i' } };
            }

            if (category) {
                filter = { select: { $regex: category } }
            }

            const result = await blogsCollection.find(filter).toArray();
            res.send(result);
        });

        // getblog for recent section
        app.get('/recentBlogs', async (req, res) => {
            const result = await blogsCollection.find().sort({_id:-1}).limit(6).toArray();
            res.send(result);
        })
 

        // get a specific blog
        app.get('/allblogs/:id', async (req, res) => {
            const id = req.params.id;
            const query = {
                _id: new ObjectId(id)
            }
            const result = await blogsCollection.findOne(query);
            res.send(result);
        })

        // get all of my blogs
        app.get('/myBlogs', firebaseTokenVerification, async (req, res) => {
            const userEmail = req.query.email;
            const firebaseEmail = req.firebaseEmail;

            if (!userEmail || userEmail !== firebaseEmail) {
                return res.status(403).send({ message: 'Forbidden: Email mismatch' });
            }

            const query = { email: userEmail };
            const result = await blogsCollection.find(query).toArray();
            res.send(result);
        });


        // update page for specific data
        app.get('/update/:id', firebaseTokenVerification, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await blogsCollection.findOne(query);
            const email = result.email;

            if (email !== req.firebaseEmail) {
                return res.status(403).send({ message: 'Forbidden: Email mismatch' });
            }
            res.send(result)
        })

        // update blog
        app.put('/blogs/:id', firebaseTokenVerification, async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;
            const email = updatedData.email;

            console.log(email)

            if (!updatedData || email !== req.firebaseEmail) {
                return res.status(403).send({ message: 'Forbidden: Email mismatch' });
            }

            const filter = { _id: new ObjectId(id) };
            const updateDocument = {
                $set: updatedData,
            };
            const result = await blogsCollection.updateOne(filter, updateDocument);
            res.send(result);
        })


        // add to wishlist
        app.post('/wishList', firebaseTokenVerification, async (req, res) => {
            const blogsData = req.body;
            const wishListemail = blogsData.wishLIstEmail;
            const firebaseEmail = req.firebaseEmail;

            if (wishListemail !== firebaseEmail) {
                return res.status(403).send({ message: 'Forbidden: Email mismatch' });
            }

            const result = await wishListCollection.insertOne(blogsData);
            res.send(result);
        })

        // get from wishlist
        app.get('/wishList', firebaseTokenVerification, async (req, res) => {
            const userEmail = req.query.email;
            const firebaseEmail = req.firebaseEmail;
            if (userEmail !== firebaseEmail) {
                return res.status(403).send({ message: 'Forbidden: Email mismatch' });
            }
            const query = { wishLIstEmail: userEmail };
            const result = await wishListCollection.find(query).toArray();
            res.send(result)
        })

        // delete from wishlist
        // secure DELETE endpoint
        app.delete('/wishList/:id', firebaseTokenVerification, async (req, res) => {
            const id = req.params.id;
            const firebaseEmail = req.firebaseEmail;

            // validate email match
            const query = { _id: new ObjectId(id), wishLIstEmail: firebaseEmail };
            const result = await wishListCollection.deleteOne(query);

            if (result.deletedCount === 0) {
                return res.status(403).send({ message: 'Forbidden: You can only delete your own wishlist item' });
            }

            res.send(result);
        });



        // postComment
        app.post('/comments', async (req, res) => {
            const commentData = req.body;
            const result = await commentsCollection.insertOne(commentData);
            res.send(result);
        })

        // get comments
        app.get('/comments', async (req, res) => {
            const blogId = req.query.blogsId;
            const query = {}
            if (blogId) {
                query.blogsId = blogId;
            }
            const result = await commentsCollection.find(query).toArray();
            res.send(result)
        })


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
