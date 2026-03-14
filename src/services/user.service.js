const { plan_user } = require("../models");

class UserService {
    static async findActiveByName(user_nama) {
        return plan_user.scope("withPassword").findOne({
            where: { user_nama, user_is_active: 1 },
        });
    }

    static async findActiveById(user_id) {
        return plan_user.findOne({
            where: { user_id, user_is_active: 1 },
            attributes: { exclude: ["user_password"] },
        });
    }

    static async createUser(payload) {
        return plan_user.create(payload);
    }
}

module.exports = UserService;
