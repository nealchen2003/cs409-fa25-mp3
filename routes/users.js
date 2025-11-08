const User = require('../models/user');
const Task = require('../models/task');
const mongoose = require('mongoose');

function raiseDbError(res, err) {
    return res.status(500).json({ message: 'Database Error', data: err });
}

module.exports = function(router) {
    router.route('/')
        .post(async function(req, res) {
            if (!req.body.name || !req.body.email) {
                return res.status(400).json({
                    message: 'Validation Error: Name and email are required.',
                    data: {}
                });
            }

            session = await mongoose.startSession();
            session.startTransaction();
            try {
                const existingUser = await User.findOne({ email: req.body.email }).session(session);
                if (existingUser) {
                    await session.abortTransaction();
                    return res.status(400).json({
                        message: 'Validation Error: Email already exists.',
                        data: {}
                    });
                }
                const user = new User({
                    name: req.body.name,
                    email: req.body.email,
                    pendingTasks: req.body.pendingTasks || []
                });
                if (user.pendingTasks.length > 0) {
                    // check that all tasks exist and are unassigned
                    const ret = await Task.updateMany(
                        { _id: { $in: user.pendingTasks }, assignedUser: "" },
                        { assignedUser: user._id.toString(), assignedUserName: user.name },
                        { session, upsert: false }
                    );
                    if (ret.n !== user.pendingTasks.length) {
                        await session.abortTransaction();
                        return res.status(400).json({
                            message: 'Validation Error: One or more tasks do not exist or are already assigned.',
                            data: {}
                        });
                    }
                }
                inserted = await user.save( { session } )
                await session.commitTransaction();
                return res.status(201).json({
                    message: 'User created!',
                    data: inserted
                });
            } catch (error) {
                await session.abortTransaction();
                return res.status(500).json({ message: 'Error creating user', data: error.toString() });
            } finally {
                await session.endSession();
            }
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
        .put(async function(req, res) {
            const session = await mongoose.startSession();
            session.startTransaction();
            try {
                const user = await User.findById(req.params.id).session(session);
                if (!user) {
                    await session.abortTransaction();
                    await session.endSession();
                    return res.status(404).json({ message: 'User not found' });
                }

                const oldPendingTasks = user.pendingTasks.map(t => t.toString());
                let newPendingTasks = req.body.pendingTasks || oldPendingTasks;
                // unique
                const newPendingTasksSet = new Set(newPendingTasks);
                newPendingTasks = Array.from(newPendingTasksSet);

                user.name = req.body.name || user.name;
                user.email = req.body.email || user.email;
                user.pendingTasks = newPendingTasks;

                await user.save({ session });

                const addedTasks = newPendingTasks.filter(t => !oldPendingTasks.includes(t));
                const removedTasks = oldPendingTasks.filter(t => !newPendingTasks.includes(t));

                if (req.body.name) {
                    await Task.updateMany({ _id: { $in: oldPendingTasks } }, { assignedUserName: user.name }).session(session);
                }
                if (addedTasks.length > 0) {
                    await Task.updateMany({ _id: { $in: addedTasks } }, { assignedUser: user._id.toString(), assignedUserName: user.name }).session(session);
                }
                if (removedTasks.length > 0) {
                    await Task.updateMany({ _id: { $in: removedTasks } }, { assignedUser: '', assignedUserName: 'unassigned' }).session(session);
                }

                await session.commitTransaction();
                res.json({ message: 'User updated!', data: user });

            } catch (error) {
                await session.abortTransaction();
                res.status(500).json({ message: 'Error updating user', data: error.toString() });
            } finally {
                await session.endSession();
            }
        })
        .delete(async function(req, res) {
            const session = await mongoose.startSession();
            session.startTransaction();
            try {
                const user = await User.findById(req.params.id).session(session);
                if (!user) {
                    await session.abortTransaction();
                    await session.endSession();
                    return res.status(404).json({ message: 'User not found' });
                }

                await Task.updateMany({ _id: { $in: user.pendingTasks } }, { assignedUser: '', assignedUserName: 'unassigned' }).session(session);
                await User.deleteOne({ _id: req.params.id }).session(session);

                await session.commitTransaction();
                res.status(204).send();

            } catch (error) {
                await session.abortTransaction();
                res.status(500).json({ message: 'Error deleting user', data: error.toString() });
            } finally {
                await session.endSession();
            }
        });
    return router;
};
