/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app) {
    const express = require('express');
    const router = express.Router();

    app.use('/api', require('./home.js')(router));

    const users = express.Router();
    require('./users.js')(users);
    app.use('/api/users', users);

    const tasks = express.Router();
    require('./tasks.js')(tasks);
    app.use('/api/tasks', tasks);
};
