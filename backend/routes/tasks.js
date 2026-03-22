const express = require('express');
const { readCollection, writeCollection, generateId } = require('../db');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET /api/tasks — list all tasks for the logged-in user
router.get('/', (req, res) => {
  try {
    const { priority, category, completed, search, sortBy = 'createdAt', order = 'desc' } = req.query;

    let tasks = readCollection('tasks').filter((t) => t.userId === req.user.id);

    // Filters
    if (priority) tasks = tasks.filter((t) => t.priority === priority);
    if (category) tasks = tasks.filter((t) => t.category === category);
    if (completed !== undefined) tasks = tasks.filter((t) => t.completed === (completed === 'true'));
    if (search) tasks = tasks.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()));

    // Sort
    tasks.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      if (order === 'asc') return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

    // Add isOverdue virtual
    const now = new Date();
    tasks = tasks.map((t) => ({
      ...t,
      isOverdue: t.dueDate && new Date(t.dueDate) < now && !t.completed
    }));

    res.json({ count: tasks.length, tasks });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tasks — create a new task
router.post('/', (req, res) => {
  try {
    const { title, description, priority, category, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Title is required.' });
    }

    const tasks = readCollection('tasks');

    const newTask = {
      id: generateId(),
      _id: generateId(), // alias for frontend compatibility
      userId: req.user.id,
      title: title.trim(),
      description: description ? description.trim() : '',
      priority: priority || 'medium',
      category: category || 'Work',
      dueDate: dueDate || null,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    newTask._id = newTask.id; // keep in sync

    tasks.push(newTask);
    writeCollection('tasks', tasks);

    res.status(201).json({ message: 'Task created.', task: newTask });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tasks/stats/summary — must be before /:id
router.get('/stats/summary', (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    const tasks = readCollection('tasks').filter((t) => t.userId === req.user.id);

    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    const overdue = tasks.filter(
      (t) => !t.completed && t.dueDate && new Date(t.dueDate) < now
    ).length;
    const today = tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) >= todayStart && new Date(t.dueDate) <= todayEnd
    ).length;

    // Group by priority
    const priorityMap = {};
    tasks.forEach((t) => {
      priorityMap[t.priority] = (priorityMap[t.priority] || 0) + 1;
    });
    const byPriority = Object.entries(priorityMap).map(([_id, count]) => ({ _id, count }));

    // Group by category
    const categoryMap = {};
    tasks.forEach((t) => {
      categoryMap[t.category] = (categoryMap[t.category] || 0) + 1;
    });
    const byCategory = Object.entries(categoryMap).map(([_id, count]) => ({ _id, count }));

    res.json({ total, completed, pending: total - completed, overdue, today, byPriority, byCategory });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tasks/:id — get a single task
router.get('/:id', (req, res) => {
  try {
    const tasks = readCollection('tasks');
    const task = tasks.find((t) => (t.id === req.params.id || t._id === req.params.id) && t.userId === req.user.id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    res.json({ task });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/tasks/:id — update a task
router.patch('/:id', (req, res) => {
  try {
    const tasks = readCollection('tasks');
    const index = tasks.findIndex(
      (t) => (t.id === req.params.id || t._id === req.params.id) && t.userId === req.user.id
    );

    if (index === -1) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    const allowed = ['title', 'description', 'priority', 'category', 'dueDate', 'completed'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (updates.completed !== undefined) {
      updates.completedAt = updates.completed ? new Date().toISOString() : null;
    }

    tasks[index] = {
      ...tasks[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    writeCollection('tasks', tasks);

    res.json({ message: 'Task updated.', task: tasks[index] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/tasks/:id — delete a task
router.delete('/:id', (req, res) => {
  try {
    const tasks = readCollection('tasks');
    const index = tasks.findIndex(
      (t) => (t.id === req.params.id || t._id === req.params.id) && t.userId === req.user.id
    );

    if (index === -1) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    tasks.splice(index, 1);
    writeCollection('tasks', tasks);

    res.json({ message: 'Task deleted.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
