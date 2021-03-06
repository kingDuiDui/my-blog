---
title: node 中的事件循环详解
date: 2017-12-28
sidebar: 'auto'
tags:
    - node
categories:
    - 前端技术
---

## 前言

代码执行器在解析执行 js 脚本时，主进程为单线程，而 node 为了防止堵塞，利用子进程，事件回调等实现了一套自己的事件循环机制。这套机制简言之就是由微任务和宏任务相互穿插执行，从而形成的一个事件环

## 微任务(micro task)和宏任务(macro task)

我对这两者的理解，所谓宏任务，就是一个子进程，在主进程后依次执行，每个宏任务有它自己的一个先进先出事件队列，当事件队列中的事件执行完或者事件执行到达上限后，则跳出该宏任务。而微任务则是当一个宏任务执行结束过后，事件执行会检测此时是否存在微任务，如果存在就去先去清空微任务的执行队列再执行下一个宏任务。

常见的微任务和宏任务分别有：

micro task

-   nextTick
-   callback
-   Promise.then
-   process.nextTick
-   Object.observe
-   MutationObserver

macro task

-   script 代码块
-   I/O
-   timer
-   UI rendering

## 事件循环

```
   ┌───────────────────────────┐
┌─>│           timers          │
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │       idle, prepare       │
│  └─────────────┬─────────────┘      ┌───────────────┐
│  ┌─────────────┴─────────────┐      │   incoming:   │
│  │           poll            │<─────┤  connections, │
│  └─────────────┬─────────────┘      │   data, etc.  │
│  ┌─────────────┴─────────────┐      └───────────────┘
│  │           check           │
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
└──┤      close callbacks      │
   └───────────────────────────┘
```

> When Node.js starts, it initializes the event loop, processes the provided input script (or drops into the REPL, which is not covered in this document) which may make async API calls, schedule timers, or call process.nextTick(), then begins processing the event loop.

以上是 node 官方对事件循环给出的解释，大概意思就是当 Node.js 启动时会初始化 event loop, 每一个 event loop 都会包含按如图顺序六个循环阶段，事件队列在同步队列执行完后，首先会执行 nextTick，等 nextTick 执行完成后，然后会先执行 micro task， 等 micro task 队列空了之后，才会去执行 macro task，如果中间添加了 micro task 加入了 micro task 队列，会继续去执行 micro task 队列，然后再回到 macro task 队列。js 引擎存在 monitoring process 进程， 会不停的监听 task queue。

## poll 阶段

可以看到，其中的 poll 在这个事件循环中起着承上启下，连接的重要作用。poll 的存在，主要有如下两个主要的功能：

-   处理 poll 队列（poll quenue）的事件(callback);
-   执行 timers 的 callback,当到达 timers 指定的时间时(不包括 setImmediate);

当程序进入到 poll 阶段时：

-   如果代码未设定 timer：
    -   如果 poll 队列不为空，那么优先执行自身 callback 队列，直至清空
    -   如果 poll 队列为空：
        -   如果代码已经被 setImmediate()设定了 callback, event loop 将结束 poll 阶段进入 check 阶段，并执行 check 阶段的 queue (check 阶段的 queue 是 setImmediate 设定的)
        -   如果代码没有设定 setImmediate(callback)，event loop 将阻塞在该阶段等待 callbacks 加入 poll queue;
-   如果代码设定了 timer:
    -   当 poll 队列为空时，执行到时的 timer

## 举例

```js
let fs = require('fs');
setTimeout(() => {
    Promise.resolve().then(() => {
        console.log('then2');
    });
}, 0);
Promise.resolve().then(() => {
    console.log('then1');
});
fs.readFile('./b.json', () => {
    process.nextTick(() => {
        console.log('nextTick');
    });
    setImmediate(() => {
        console.log('setImmediate');
    });
});
// then1 then2 nextTick setImmediate
```

解析：当 node 执行完主线程时， setTimeout, Promise, fs.readFile 将会被同步放入事件队列。主线程宏任务执行完成之后，优先执行微线程，所以会率先打印 then1 ,此时 timer 到期，再执行 timer，则打印 then2。timer 执行完之后，进入到轮训 poll 阶段，即执行 io 操作的回调。在该回调中，微任务 process.nextTick 将会在 check 之前执行。

## 场景

### process.nextTick() VS setImmediate()

> In essence, the names should be swapped. process.nextTick() fires more immediately than setImmediate()

来自官方文档有意思的一句话，从语义角度看，setImmediate() 应该比 process.nextTick() 先执行才对，而事实相反，命名是历史原因也很难再变。process.nextTick() 会在各个事件阶段之间执行，一旦执行，要直到 nextTick 队列被清空，才会进入到下一个事件阶段，所以如果递归调用 process.nextTick()，会导致出现 I/O starving（饥饿）的问题，比如下面例子的 readFile 已经完成，但它的回调一直无法执行：

```js
const fs = require('fs');
const starttime = Date.now();
let endtime;

fs.readFile('text.txt', () => {
    endtime = Date.now();
    console.log('finish reading time: ', endtime - starttime);
});

let index = 0;

function handler() {
    if (index++ >= 1000) return;
    console.log(`nextTick ${index}`);
    process.nextTick(handler);
    // console.log(`setImmediate ${index}`)
    // setImmediate(handler)
}

handler();
```

process.nextTick()的运行结果：

```
nextTick 1
nextTick 2
......
nextTick 999
nextTick 1000
finish reading time: 170
```

setImmediate()的运行结果：

```
setImmediate 1
setImmediate 2
finish reading time: 80
......
setImmediate 999
setImmediate 1000
```

这是因为嵌套调用的 setImmediate() 回调，被排到了下一次 event loop 才执行，所以不会出现阻塞

## 总结

-   Node.js 的事件循环分为 6 个阶段
-   Node.js 中，microtask 在事件循环的各个阶段之间执行
-   递归的调用 process.nextTick()会导致 I/O 阻塞，官方推荐使用 setImmediate()

[参考资料]

[深入理解 js 事件循环机制（Node.js 篇）]('http://lynnelv.github.io/js-event-loop-nodejs')

[Node.js Event Loop 的理解 Timers，process.nextTick()](https://cnodejs.org/topic/57d68794cb6f605d360105bf)
