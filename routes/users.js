const User = require('../models/user');
const Task = require('../models/task');

function raiseDbError(res, err) {
    return res.status(500).json({ message: 'Database Error', data: err });
}

module.exports = function(router) {
    router.route('/')
        .post(function(req, res) {
            const user = new User();
            user.name = req.body.name;
            user.email = req.body.email;

            if (!user.name || !user.email) {
                return res.status(400).json({
                    message: 'Validation Error: Name and email are required.',
                    data: {}
                });
            }

            User.findOne({ email: user.email }, (err, existingUser) => {
                if (err) {
                    return raiseDbError(res, err);
                }
                if (existingUser) {
                    return res.status(400).json({
                        message: 'Validation Error: Email already exists.',
                        data: {}
                    });
                }

                user.save(function(err) {
                    if (err) {
                        return raiseDbError(res, err);
                    }
                    res.status(201).json({
                        message: 'User created!',
                        data: user
                    });
                });
            });
        })
        .get(function(req, res) {
            let query = User.find();

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
                query.exec(function(err, users) {
                    if (err) {
                        return raiseDbError(res, err);
                    }
                    res.json({
                        message: "OK",
                        data: users
                    });
                });
            }
        });

    router.route('/:id')
        .get(function(req, res) {
            var query = User.findById(req.params.id);

            if (req.query.select) {
                try {
                    query.select(JSON.parse(req.query.select));
                } catch (e) {
                    return res.status(400).json({ message: "Invalid 'select' parameter", data: {} });
                }
            }

            query.exec(function(err, user) {
                if (err) {
                    return raiseDbError(res, err);
                }
                if (!user) {
                    return res.status(404).json({
                        message: 'User not found',
                        data: {}
                    });
                }
                res.json({
                    message: 'OK',
                    data: user
                });
            });
        })
        .put(function(req, res) {
            User.findById(req.params.id, function(err, user) {
                if (err) {
                    return raiseDbError(res, err);
                }
                if (!user) {
                    return res.status(404).json({
                        message: 'User not found',
                        data: {}
                    });
                }

                let removedTasks = [];
                let newTasks = [];
                let renamedTasks = [];

                if (req.body.name) {
                    user.name = req.body.name;
                    renamedTasks = user.pendingTasks.slice(); // all pending tasks need to be renamed
                }

                if (req.body.email) {
                    user.email = req.body.email;
                }

                if (req.body.pendingTasks) {
                    // unassign tasks that are no longer pending
                    removedTasks = user.pendingTasks.filter(t => !req.body.pendingTasks.includes(t));
                    // assign new pending tasks
                    newTasks = req.body.pendingTasks.filter(t => !user.pendingTasks.includes(t));
                    renamedTasks = user.pendingTasks.filter(t => !removedTasks.includes(t));

                    user.pendingTasks = req.body.pendingTasks;
                }

                user.save(function(err) {
                    if (err) {
                        return raiseDbError(res, err);
                    }
                    if (removedTasks.length > 0) {
                        Task.updateMany({ _id: { $in: removedTasks } }, { assignedUser: "", assignedUserName: "unassigned" }, function(err) {
                            if (err) {
                                return raiseDbError(res, err);
                            }
                        });
                    }
                    if (newTasks.length > 0) {
                        Task.updateMany({ _id: { $in: newTasks } }, { assignedUser: user._id, assignedUserName: user.name }, function(err) {
                            if (err) {
                                return raiseDbError(res, err);
                            }
                        });
                    }
                    if (renamedTasks.length > 0) {
                        Task.updateMany({ _id: { $in: renamedTasks } }, { assignedUserName: user.name }, function(err) {
                            if (err) {
                                return raiseDbError(res, err);
                            }
                        });
                    }
                    res.json({
                        message: 'User updated!',
                        data: user
                    });
                });
            });
        })
        .delete(function(req, res) {
            User.findByIdAndRemove(req.params.id, function(err, user) {
                if (err) {
                    return raiseDbError(res, err);
                }
                if (!user) {
                    return res.status(404).json({
                        message: 'User not found',
                        data: {}
                    });
                }

                // Unassign tasks from the deleted user
                Task.updateMany({ assignedUser: user._id }, { assignedUser: "", assignedUserName: "unassigned" }, function(err) {
                    if (err) {
                        return raiseDbError(res, err);
                    }
                    res.status(204).json({
                        message: 'User deleted!'
                    });
                });
            });
        });
    return router;
};
