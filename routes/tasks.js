const Task = require('../models/task');
const User = require('../models/user');
const mongoose = require('mongoose');

function raiseDbError(res, err) {
    return res.status(500).json({ message: 'Database Error', data: err });
}

module.exports = function(router) {
    router.route('/')
        .post(async function(req, res) {
            console.log(req.body);
            if (!req.body.name || !req.body.deadline) {
                return res.status(400).json({
                    message: 'Validation Error: Name and deadline are required.',
                    data: {}
                });
            }

            // completed could be "true", true, "false" or false
            try {
                var completed = req.body.completed === undefined ? false : JSON.parse(req.body.completed);
            } catch (e) {
                return res.status(400).json({
                    message: 'Validation Error: \'completed\' must be a boolean value.',
                    data: {}
                });
            }

            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                const task = new Task({
                    name: req.body.name,
                    description: req.body.description || "",
                    deadline: req.body.deadline,
                    completed: completed,
                    assignedUser: req.body.assignedUser || "",
                    assignedUserName: req.body.assignedUserName || "unassigned"
                });

                if (task.assignedUser) {
                    const user = await User.findById(task.assignedUser).session(session);
                    if (!user) {
                        await session.abortTransaction();
                        return res.status(400).json({
                            message: 'Validation Error: Assigned user does not exist.',
                            data: {}
                        });
                    }
                    if (!completed) {
                        user.pendingTasks.push(task._id.toString());
                        await user.save({ session });
                    }
                }

                inserted = await task.save({ session });

                await session.commitTransaction();

                console.log(inserted);
                res.status(201).json({
                    message: 'Task created!',
                    data: inserted
                });
            } catch (error) {
                await session.abortTransaction();
                res.status(500).json({ message: 'Error creating task', data: error.toString() });
            } finally {
                await session.endSession();
            }
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
                try {
                    query.skip(parseInt(req.query.skip));
                } catch (e) {
                    return res.status(400).json({ message: "Invalid 'skip' parameter", data: {} });
                }
            }

            if (req.query.limit) {
                try {
                    query.limit(parseInt(req.query.limit));
                } catch (e) {
                    return res.status(400).json({ message: "Invalid 'limit' parameter", data: {} });
                }
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
        .put(async function(req, res) {
            const session = await mongoose.startSession();
            session.startTransaction();
            try {
                const task = await Task.findById(req.params.id).session(session);
                if (!task) {
                    await session.abortTransaction();
                    return res.status(404).json({ message: 'Task not found' });
                }

                const oldAssignedUser = task.assignedUser;
                const newAssignedUser = req.body.assignedUser;

                task.name = req.body.name || task.name;
                task.deadline = req.body.deadline || task.deadline;
                task.description = req.body.description || task.description;
                try {
                    task.completed = req.body.completed === undefined ? task.completed : JSON.parse(req.body.completed);
                } catch (e) {
                    return res.status(400).json({
                        message: 'Validation Error: \'completed\' must be a boolean value.',
                        data: {}
                    });
                }
                task.assignedUser = newAssignedUser;
                task.assignedUserName = req.body.assignedUserName || 'unassigned';

                await task.save({ session });

                if (oldAssignedUser) {
                    await User.findByIdAndUpdate(oldAssignedUser, { $pull: { pendingTasks: task._id.toString() } }).session(session);
                }

                if (newAssignedUser) {
                    let user = await User.findById(newAssignedUser).session(session);
                    if (!user) {
                        await session.abortTransaction();
                        return res.status(400).json({
                            message: 'Validation Error: Assigned user does not exist.',
                            data: {}
                        });
                    }
                    if (!task.completed) {
                        user.pendingTasks.push(task._id.toString());
                        await user.save({ session });
                    }
                }

                await session.commitTransaction();
                res.json({ message: 'Task updated!', data: task });
            } catch (error) {
                await session.abortTransaction();
                res.status(500).json({ message: 'Error updating task', data: error.toString() });
            } finally {
                await session.endSession();
            }
        })
        .delete(async function(req, res) {
            const session = await mongoose.startSession();
            session.startTransaction();
            try {
                const task = await Task.findById(req.params.id).session(session);
                if (!task) {
                    await session.abortTransaction();
                    await session.endSession();
                    return res.status(404).json({ message: 'Task not found' });
                }

                if (task.assignedUser) {
                    await User.findByIdAndUpdate(task.assignedUser, { $pull: { pendingTasks: task._id.toString() } }).session(session);
                }

                await Task.deleteOne({ _id: req.params.id }).session(session);

                await session.commitTransaction();
                res.status(204).send();

            } catch (error) {
                await session.abortTransaction();
                res.status(500).json({ message: 'Error deleting task', data: error.toString() });
            } finally {
                await session.endSession();
            }
        });
    return router;
};
