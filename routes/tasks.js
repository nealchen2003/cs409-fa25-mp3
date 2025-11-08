const Task = require('../models/task');
const User = require('../models/user');

function raiseDbError(res, err) {
    return res.status(500).json({ message: 'Database Error', data: err });
}

module.exports = function(router) {
    router.route('/')
        .post(function(req, res) {
            const task = new Task();
            task.name = req.body.name;
            task.deadline = req.body.deadline;
            task.description = req.body.description;
            task.assignedUser = req.body.assignedUser;
            task.assignedUserName = req.body.assignedUserName;

            if (!task.name || !task.deadline) {
                return res.status(400).json({
                    message: 'Validation Error: Name and deadline are required.',
                    data: {}
                });
            }

            task.save(function(err) {
                if (err) {
                    return raiseDbError(res, err);
                }
                res.status(201).json({
                    message: 'Task created!',
                    data: task
                });
            });
        })
        .get(function(req, res) {
            let query = Task.find();

            if (req.query.where) {
                try {
                    query.where(JSON.parse(req.query.where));
                } catch (e) {
                    return res.status(400).json({ message: "Invalid 'where' parameter", data: {} });
                }
            }

            if (req.query.sort) {
                try {
                    query.sort(JSON.parse(req.query.sort));
                } catch (e) {
                    return res.status(400).json({ message: "Invalid 'sort' parameter", data: {} });
                }
            }

            if (req.query.select) {
                try {
                    query.select(JSON.parse(req.query.select));
                } catch (e) {
                    return res.status(400).json({ message: "Invalid 'select' parameter", data: {} });
                }
            }

            if (req.query.skip) {
                query.skip(parseInt(req.query.skip));
            }

            if (req.query.limit) {
                query.limit(parseInt(req.query.limit));
            }

            if (req.query.count === 'true') {
                query.countDocuments().exec(function(err, count) {
                    if (err) {
                        return raiseDbError(res, err);
                    }
                    res.json({
                        message: "OK",
                        data: count
                    });
                });
            } else {
                query.exec(function(err, tasks) {
                    if (err) {
                        return raiseDbError(res, err);
                    }
                    res.json({
                        message: "OK",
                        data: tasks
                    });
                });
            }
        });

    router.route('/:id')
        .get(function(req, res) {
            var query = Task.findById(req.params.id);

            if (req.query.select) {
                try {
                    query.select(JSON.parse(req.query.select));
                } catch (e) {
                    return res.status(400).json({ message: "Invalid 'select' parameter", data: {} });
                }
            }

            query.exec(function(err, task) {
                if (err) {
                    return raiseDbError(res, err);
                }
                if (!task) {
                    return res.status(404).json({
                        message: 'Task not found',
                        data: {}
                    });
                }
                res.json({
                    message: 'OK',
                    data: task
                });
            });
        })
        .put(function(req, res) {
            Task.findById(req.params.id, function(err, task) {
                if (err) {
                    return raiseDbError(res, err);
                }
                if (!task) {
                    return res.status(404).json({
                        message: 'Task not found',
                        data: {}
                    });
                }

                const oldAssignedUser = task.assignedUser;

                task.name = req.body.name;
                task.deadline = req.body.deadline;
                task.description = req.body.description;
                task.completed = req.body.completed;
                task.assignedUser = req.body.assignedUser;
                task.assignedUserName = req.body.assignedUserName;

                if (!task.name || !task.deadline) {
                    return res.status(400).json({
                        message: 'Validation Error: Name and deadline are required.',
                        data: {}
                    });
                }

                task.save(function(err) {
                    if (err) {
                        return raiseDbError(res, err);
                    }

                    // If assigned user changed, update both old and new users
                    if (oldAssignedUser !== task.assignedUser) {
                        // Remove task from old user's pendingTasks
                        if (oldAssignedUser) {
                            User.findById(oldAssignedUser, (err, oldUser) => {
                                if (oldUser) {
                                    oldUser.pendingTasks.pull(task._id);
                                    oldUser.save();
                                }
                            });
                        }
                        // Add task to new user's pendingTasks
                        if (task.assignedUser) {
                            User.findById(task.assignedUser, (err, newUser) => {
                                if (newUser) {
                                    newUser.pendingTasks.push(task._id);
                                    newUser.save();
                                }
                            });
                        }
                    }

                    res.json({
                        message: 'Task updated!',
                        data: task
                    });
                });
            });
        })
        .delete(function(req, res) {
            Task.findByIdAndRemove(req.params.id, function(err, task) {
                if (err) {
                    return raiseDbError(res, err);
                }
                if (!task) {
                    return res.status(404).json({
                        message: 'Task not found',
                        data: {}
                    });
                }

                // Remove task from assigned user's pendingTasks
                if (task.assignedUser) {
                    User.findById(task.assignedUser, (err, user) => {
                        if (user) {
                            user.pendingTasks.pull(task._id);
                            user.save();
                        }
                    });
                }

                res.status(204).json({
                    message: 'Task deleted!'
                });
            });
        });
    return router;
};
