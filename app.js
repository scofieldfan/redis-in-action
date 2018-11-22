// 导入koa，和koa 1.x不同，在koa2中，我们导入的是一个class，因此用大写的Koa表示:
const Koa = require("koa");
var redis = require("redis"),
    client = redis.createClient();
const { promisify } = require("util");
const getAsync = promisify(client.get).bind(client);
const incrAsync = promisify(client.incr).bind(client);

const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60,
    VOTE_SCORE = 432;

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

// 对于任何请求，app将调用该异步函数处理请求：
router.get("/add", (ctx, next) => {
    const id = Math.floor(Math.random(1) * 100);
    postArticle(`user:${id}`, "我是明星", "https://510team.github.com");
});

// add router middleware:
app.use(router.routes());

// 在端口3000监听:
app.listen(3000);
console.log("app started at port 3000...");

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
