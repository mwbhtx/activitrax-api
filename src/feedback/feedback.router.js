const express = require("express");
const { validateAccessToken, isAdmin, requireAdmin } = require("../middleware/auth0.middleware");
const feedbackRouter = express.Router();
const feedbackRepository = require("../mongodb/feedback.repository");
const logger = require('../logger');

/*
 * Feedback Router
 * Handles private feedback/support ticket system
 * Privacy: Regular users only see their own topics, admins see all
 */

/**
 * GET /topics
 * List feedback topics
 * Regular user: Returns only their own topics
 * Admin: Returns all topics with optional filters
 */
feedbackRouter.get('/topics', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const admin = isAdmin(req);

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const pagination = { page, limit };

        let result;
        if (admin) {
            // Admin: get all topics with filters
            const filters = {
                category: req.query.category,
                status: req.query.status
            };
            const sort = req.query.sort || 'needs_response';
            pagination.sort = sort;

            result = await feedbackRepository.getAllTopics(filters, pagination);
        } else {
            // Regular user: get only their own topics
            result = await feedbackRepository.getTopicsByUser(user_id, pagination);
        }

        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, 'failed to get topics');
        res.status(500).json({ message: 'server error' });
    }
});

/**
 * POST /topics
 * Create a new feedback topic
 */
feedbackRouter.post('/topics', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const { title, description, category } = req.body;

        // Validation
        if (!title || title.length > 200) {
            return res.status(400).json({ message: 'Title is required and must be 200 characters or less' });
        }
        if (!description || description.length < 10) {
            return res.status(400).json({ message: 'Description must be at least 10 characters' });
        }
        if (!category || !feedbackRepository.VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({ message: `Invalid category. Must be one of: ${feedbackRepository.VALID_CATEGORIES.join(', ')}` });
        }

        const topic = await feedbackRepository.createTopic(user_id, { title, description, category });
        res.status(201).json(topic);
    } catch (error) {
        logger.error({ err: error }, 'failed to create topic');
        res.status(500).json({ message: 'server error' });
    }
});

/**
 * GET /topics/:topic_id
 * Get a single topic with its replies
 * Access control: user must own the topic OR be an admin
 */
feedbackRouter.get('/topics/:topic_id', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const topic_id = req.params.topic_id;
        const admin = isAdmin(req);

        const topic = await feedbackRepository.getTopicById(topic_id);

        if (!topic) {
            return res.status(404).json({ message: 'Topic not found' });
        }

        // Access control: verify ownership OR admin
        if (!admin && topic.auth0_uid !== user_id) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Get replies
        const replies = await feedbackRepository.getRepliesByTopic(topic_id);

        res.status(200).json({ topic, replies });
    } catch (error) {
        logger.error({ err: error }, 'failed to get topic');
        res.status(500).json({ message: 'server error' });
    }
});

/**
 * PATCH /topics/:topic_id/status
 * Update topic status (admin only)
 */
feedbackRouter.patch('/topics/:topic_id/status', validateAccessToken, requireAdmin, async (req, res) => {
    try {
        const topic_id = req.params.topic_id;
        const { status } = req.body;

        if (!status || !feedbackRepository.VALID_STATUSES.includes(status)) {
            return res.status(400).json({ message: `Invalid status. Must be one of: ${feedbackRepository.VALID_STATUSES.join(', ')}` });
        }

        await feedbackRepository.updateTopicStatus(topic_id, status);
        res.status(200).json({ message: 'Status updated' });
    } catch (error) {
        logger.error({ err: error }, 'failed to update topic status');
        res.status(500).json({ message: 'server error' });
    }
});

/**
 * DELETE /topics/:topic_id
 * Delete a topic and all its replies (admin only)
 */
feedbackRouter.delete('/topics/:topic_id', validateAccessToken, requireAdmin, async (req, res) => {
    try {
        const topic_id = req.params.topic_id;

        await feedbackRepository.deleteTopic(topic_id);
        res.status(200).json({ message: 'Topic deleted' });
    } catch (error) {
        logger.error({ err: error }, 'failed to delete topic');
        res.status(500).json({ message: 'server error' });
    }
});

/**
 * POST /topics/:topic_id/replies
 * Add a reply to a topic
 * Access control: user must own the topic OR be an admin
 */
feedbackRouter.post('/topics/:topic_id/replies', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const topic_id = req.params.topic_id;
        const { content } = req.body;
        const admin = isAdmin(req);

        // Validation
        if (!content || content.length < 1) {
            return res.status(400).json({ message: 'Reply content is required' });
        }

        const topic = await feedbackRepository.getTopicById(topic_id);

        if (!topic) {
            return res.status(404).json({ message: 'Topic not found' });
        }

        // Access control: verify ownership OR admin
        if (!admin && topic.auth0_uid !== user_id) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const reply = await feedbackRepository.createReply(user_id, topic_id, content, admin);
        res.status(201).json(reply);
    } catch (error) {
        logger.error({ err: error }, 'failed to create reply');
        res.status(500).json({ message: 'server error' });
    }
});

/**
 * DELETE /replies/:reply_id
 * Delete a reply (admin only)
 */
feedbackRouter.delete('/replies/:reply_id', validateAccessToken, requireAdmin, async (req, res) => {
    try {
        const reply_id = req.params.reply_id;

        await feedbackRepository.deleteReply(reply_id);
        res.status(200).json({ message: 'Reply deleted' });
    } catch (error) {
        logger.error({ err: error }, 'failed to delete reply');
        res.status(500).json({ message: 'server error' });
    }
});

/**
 * GET /unread-count
 * Get count of unread topics for current user
 */
feedbackRouter.get('/unread-count', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const admin = isAdmin(req);

        const count = await feedbackRepository.getUnreadCount(user_id, admin);
        res.status(200).json({ count });
    } catch (error) {
        logger.error({ err: error }, 'failed to get unread count');
        res.status(500).json({ message: 'server error' });
    }
});

/**
 * POST /topics/:topic_id/mark-read
 * Mark a topic as read
 */
feedbackRouter.post('/topics/:topic_id/mark-read', validateAccessToken, async (req, res) => {
    try {
        const user_id = req.auth.payload.sub;
        const topic_id = req.params.topic_id;
        const admin = isAdmin(req);

        const topic = await feedbackRepository.getTopicById(topic_id);

        if (!topic) {
            return res.status(404).json({ message: 'Topic not found' });
        }

        // Access control: verify ownership OR admin
        if (!admin && topic.auth0_uid !== user_id) {
            return res.status(403).json({ message: 'Access denied' });
        }

        await feedbackRepository.markAsRead(topic_id, admin);
        res.status(200).json({ message: 'Topic marked as read' });
    } catch (error) {
        logger.error({ err: error }, 'failed to mark topic as read');
        res.status(500).json({ message: 'server error' });
    }
});

module.exports = { feedbackRouter };
