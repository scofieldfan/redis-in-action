// 导入koa，和koa 1.x不同，在koa2中，我们导入的是一个class，因此用大写的Koa表示:
const Koa = require("koa");
var redis = require("redis"),
    client = redis.createClient();
const { promisify } = require("util");
const getAsync = promisify(client.get).bind(client);
const incrAsync = promisify(client.incr).bind(client);
const zrevrangeAsync = promisify(client.zrange).bind(client);
const zscoreAsync = promisify(client.zscore).bind(client);
const hgetallAsync = promisify(client.hgetall).bind(client);
const existsAsync = promisify(client.exists).bind(client);
const zinterAsync = promisify(client.zinterstore).bind(client);
const expireAync = promisify(client.expire).bind(client);

const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60,
    VOTE_SCORE = 432,
    PAGE_SIZE = 10;

const router = require("koa-router")();

// 创建一个Koa对象表示web app本身:
const app = new Koa();

app.use(async (ctx, next) => {
    console.log(`Process ${ctx.request.method} ${ctx.request.url}...`);
    await next();
});

// 对于任何请求，app将调用该异步函数处理请求：
router.get("/", async (ctx, next) => {
    return getAsync("foo").then(function(res) {
        console.log(res); // => 'bar'
        ctx.response.body = res;
    });
});

router.get("/add", (ctx, next) => {
    const id = Math.floor(Math.random(1) * 100);
    postArticle(`user:${id}`, "我是明星", "https://510team.github.com");
});

router.get("/voted", (ctx, next) => {
    articleVoted("user:1", "article:10");
});

router.get("/get", async (ctx, next) => {
    //ctx.response.body = JSON.stringify(getArticles(1));
    const ret = JSON.stringify(await getArticles(1));
    ctx.response.body = ret;
});

router.get("/add-group", async (ctx, next) => {
    addRemoveGroup("article:10", ["programming"], ["children"]);
});

router.get("/inter", async (ctx, next) => {
    const ret = JSON.stringify(
        await getGroupArticles("programming", 1, "score:")
    );
    ctx.response.body = ret;
});

// add router middleware:
app.use(router.routes());

// 在端口3000监听:
app.listen(3000);
console.log("app started at port 3000...");

//发布文章
async function postArticle(userKey, title, link) {
    const articleId = await incrAsync("article");
    const votedKey = `voted:${articleId}`;
    const articleKey = `article:${articleId}`;

    const now = new Date().getTime();

    console.log(now);
    client.sadd(votedKey, userKey);
    client.expire(votedKey, ONE_WEEK_IN_SECONDS);

    client.hmset(articleKey, {
        title,
        link,
        user: userKey,
        time: now,
        voteds: 1
    });
    client.zadd("score:", now + VOTE_SCORE, articleKey);
    client.zadd("time:", now, articleKey);
}

//投票文章
async function articleVoted(userKey, articleKey) {
    const now = new Date().getTime();
    postArticleTime = await zscoreAsync("time:", articleKey);
    if (postArticleTime + ONE_WEEK_IN_SECONDS * 1000 < now) {
        //超过截止时间了
        console.log("超过机制时间了", postArticleTime);
        console.log("超过机制时间了", new Date(postArticleTime));
        return;
    }
    const articleId = articleKey.split(":")[1];
    const votedKey = `voted:${articleId}`;

    //投票成功
    console.log(`votedKey ${votedKey} articleKey ${articleKey}`);
    if (client.sadd(votedKey, userKey)) {
        client.zincrby("score:", VOTE_SCORE, articleKey);
        client.hincrby(articleKey, "votes", 1);
    }
}

async function getArticles(page, setKey = "score:") {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE - 1;
    const ids = await zrevrangeAsync(setKey, start, end);
    let articles = [];
    for (const id of ids) {
        let articleData = await hgetallAsync(id);
        articleData.id = id;
        articles.push(articleData);
    }
    return articles;
    // console.log("articles:", articles);
}

function addRemoveGroup(articleKey, toAddGroups = [], toRemoveGroups = []) {
    console.log(articleKey, toAddGroups);
    for (const group of toAddGroups) {
        console.log(`add group...${group} ${articleKey}`);
        client.sadd(`group:${group}`, articleKey);
    }
    for (const group of toRemoveGroups) {
        console.log(`remove group...${group} ${articleKey}`);
        client.srem(`group:${group}`, articleKey);
    }
}

async function getGroupArticles(group, page, setKey) {
    //order=score: group = programming
    let key = setKey + group;
    const groupKey = `group:${group}`;
    console.log(`key ${key}`);
    const isExist = await existsAsync(key);
    if (!isExist) {
        var args = [key, "2", groupKey, setKey, "aggregate", "max"];
        return zinterAsync(args)
            .then(res => {
                return expireAync(key, 3600);
            })
            .then(item => {
                return getArticles(page, key);
            });
    } else {
        return getArticles(page, key);
    }
}
