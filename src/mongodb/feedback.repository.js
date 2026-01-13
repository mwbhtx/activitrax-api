const mongoClient = require('./mongodb.service.js');
const { ObjectId } = require('mongodb');

const feedbackTopicsDb = mongoClient.db().collection('feedback_topics');
const feedbackRepliesDb = mongoClient.db().collection('feedback_replies');

// Valid enums
const VALID_CATEGORIES = ['Bug Report', 'Feature Request', 'Question', 'Discussion'];
const VALID_STATUSES = ['Open', 'Closed'];

/**
 * Create a new feedback topic
 * @param {string} auth0_uid - User's Auth0 ID
 * @param {Object} topicData - { title, description, category }
 * @returns {Object} Created topic
 */
const createTopic = async (auth0_uid, topicData) => {
    const topic = {
        auth0_uid,
        title: topicData.title,
        description: topicData.description,
        category: topicData.category,
        status: 'Open',
        last_reply_is_admin: false,
        has_admin_reply: false,
        reply_count: 0,
        unread_by_user: false,    // User has read their own topic
        unread_by_admin: true,     // New topic needs admin attention
        created_at: new Date(),
        updated_at: new Date()
    };

    const result = await feedbackTopicsDb.insertOne(topic);
    return { ...topic, _id: result.insertedId };
};

/**
 * Get topics for a specific user (regular users only see their own)
 * @param {string} auth0_uid - User's Auth0 ID
 * @param {Object} pagination - { page, limit }
 * @returns {Object} { topics, total, page, pages }
 */
const getTopicsByUser = async (auth0_uid, pagination = {}) => {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const skip = (page - 1) * limit;

    const topics = await feedbackTopicsDb
        .find({ auth0_uid })
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

    const total = await feedbackTopicsDb.countDocuments({ auth0_uid });

    return {
        topics,
        total,
        page,
        pages: Math.ceil(total / limit)
    };
};

/**
 * Get all topics with filters (admin only)
 * @param {Object} filters - { category, status }
 * @param {Object} pagination - { page, limit, sort }
 * @returns {Object} { topics, total, page, pages }
 */
const getAllTopics = async (filters = {}, pagination = {}) => {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const skip = (page - 1) * limit;
    const sort = pagination.sort || 'needs_response'; // 'needs_response' | 'recent_activity' | 'newest'

    // Build query
    const query = {};
    if (filters.category && VALID_CATEGORIES.includes(filters.category)) {
        query.category = filters.category;
    }
    if (filters.status && VALID_STATUSES.includes(filters.status)) {
        query.status = filters.status;
    }

    // Determine sort order
    let sortCriteria;
    if (sort === 'needs_response') {
        // Topics awaiting admin response first (last_reply_is_admin = false AND status = Open)
        // Then by updated_at desc
        sortCriteria = { last_reply_is_admin: 1, updated_at: -1 };
    } else if (sort === 'newest') {
        sortCriteria = { created_at: -1 };
    } else {
        // recent_activity
        sortCriteria = { updated_at: -1 };
    }

    const topics = await feedbackTopicsDb
        .find(query)
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .toArray();

    const total = await feedbackTopicsDb.countDocuments(query);

    return {
        topics,
        total,
        page,
        pages: Math.ceil(total / limit)
    };
};

/**
 * Get a single topic by ID
 * @param {string} topic_id - Topic's ObjectId
 * @returns {Object|null} Topic document
 */
const getTopicById = async (topic_id) => {
    return await feedbackTopicsDb.findOne({ _id: new ObjectId(topic_id) });
};

/**
 * Check if user owns a topic
 * @param {string} topic_id - Topic's ObjectId
 * @param {string} auth0_uid - User's Auth0 ID
 * @returns {boolean}
 */
const checkTopicOwnership = async (topic_id, auth0_uid) => {
    const topic = await getTopicById(topic_id);
    return topic && topic.auth0_uid === auth0_uid;
};

/**
 * Update topic status (admin only)
 * @param {string} topic_id - Topic's ObjectId
 * @param {string} status - 'Open' or 'Closed'
 */
const updateTopicStatus = async (topic_id, status) => {
    if (!VALID_STATUSES.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
    }

    await feedbackTopicsDb.updateOne(
        { _id: new ObjectId(topic_id) },
        {
            $set: {
                status,
                updated_at: new Date()
            }
        }
    );
};

/**
 * Delete a topic and all its replies (admin only)
 * @param {string} topic_id - Topic's ObjectId
 */
const deleteTopic = async (topic_id) => {
    const topicObjectId = new ObjectId(topic_id);

    // Delete all replies first
    await feedbackRepliesDb.deleteMany({ topic_id: topicObjectId });

    // Delete the topic
    await feedbackTopicsDb.deleteOne({ _id: topicObjectId });
};

/**
 * Update topic activity timestamp
 * @param {string} topic_id - Topic's ObjectId
 */
const touchTopicActivity = async (topic_id) => {
    await feedbackTopicsDb.updateOne(
        { _id: new ObjectId(topic_id) },
        { $set: { updated_at: new Date() } }
    );
};

/**
 * Create a reply to a topic
 * @param {string} auth0_uid - Reply author's Auth0 ID
 * @param {string} topic_id - Topic's ObjectId
 * @param {string} content - Reply content
 * @param {boolean} is_admin - Whether the author is an admin
 * @returns {Object} Created reply
 */
const createReply = async (auth0_uid, topic_id, content, is_admin) => {
    const topicObjectId = new ObjectId(topic_id);

    const reply = {
        topic_id: topicObjectId,
        auth0_uid,
        is_admin,
        content,
        created_at: new Date()
    };

    const result = await feedbackRepliesDb.insertOne(reply);

    // Update topic: increment reply_count, set has_admin_reply, set last_reply_is_admin, update timestamp, set unread flags
    const updateFields = {
        updated_at: new Date(),
        last_reply_is_admin: is_admin
    };

    if (is_admin) {
        updateFields.has_admin_reply = true;
        updateFields.unread_by_user = true;   // Admin replied, mark as unread for user
        updateFields.unread_by_admin = false; // Admin has seen it
    } else {
        updateFields.unread_by_admin = true;  // User replied, mark as unread for admin
        updateFields.unread_by_user = false;  // User has seen it
    }

    await feedbackTopicsDb.updateOne(
        { _id: topicObjectId },
        {
            $inc: { reply_count: 1 },
            $set: updateFields
        }
    );

    return { ...reply, _id: result.insertedId };
};

/**
 * Get all replies for a topic
 * @param {string} topic_id - Topic's ObjectId
 * @returns {Array} Array of replies
 */
const getRepliesByTopic = async (topic_id) => {
    return await feedbackRepliesDb
        .find({ topic_id: new ObjectId(topic_id) })
        .sort({ created_at: 1 })
        .toArray();
};

/**
 * Delete a reply (admin only)
 * @param {string} reply_id - Reply's ObjectId
 */
const deleteReply = async (reply_id) => {
    const reply = await feedbackRepliesDb.findOne({ _id: new ObjectId(reply_id) });

    if (reply) {
        // Delete the reply
        await feedbackRepliesDb.deleteOne({ _id: new ObjectId(reply_id) });

        // Decrement topic's reply_count
        await feedbackTopicsDb.updateOne(
            { _id: reply.topic_id },
            {
                $inc: { reply_count: -1 },
                $set: { updated_at: new Date() }
            }
        );

        // If this was the last reply, recalculate last_reply_is_admin
        const remainingReplies = await getRepliesByTopic(reply.topic_id.toString());
        if (remainingReplies.length > 0) {
            const lastReply = remainingReplies[remainingReplies.length - 1];
            await feedbackTopicsDb.updateOne(
                { _id: reply.topic_id },
                { $set: { last_reply_is_admin: lastReply.is_admin } }
            );
        } else {
            // No replies left
            await feedbackTopicsDb.updateOne(
                { _id: reply.topic_id },
                { $set: { last_reply_is_admin: false, has_admin_reply: false } }
            );
        }
    }
};

/**
 * Get count of unread topics for a user or admin
 * @param {string} auth0_uid - User's Auth0 ID
 * @param {boolean} is_admin - Whether the user is an admin
 * @returns {number} Count of unread topics
 */
const getUnreadCount = async (auth0_uid, is_admin) => {
    if (is_admin) {
        // For admins, count topics where unread_by_admin = true
        return await feedbackTopicsDb.countDocuments({ unread_by_admin: true });
    } else {
        // For users, count their own topics where unread_by_user = true
        return await feedbackTopicsDb.countDocuments({
            auth0_uid,
            unread_by_user: true
        });
    }
};

/**
 * Mark a topic as read by user or admin
 * @param {string} topic_id - Topic's ObjectId
 * @param {boolean} is_admin - Whether the reader is an admin
 */
const markAsRead = async (topic_id, is_admin) => {
    const updateField = is_admin ? 'unread_by_admin' : 'unread_by_user';
    await feedbackTopicsDb.updateOne(
        { _id: new ObjectId(topic_id) },
        { $set: { [updateField]: false } }
    );
};

module.exports = {
    createTopic,
    getTopicsByUser,
    getAllTopics,
    getTopicById,
    checkTopicOwnership,
    updateTopicStatus,
    deleteTopic,
    touchTopicActivity,
    createReply,
    getRepliesByTopic,
    deleteReply,
    getUnreadCount,
    markAsRead,
    VALID_CATEGORIES,
    VALID_STATUSES
};
