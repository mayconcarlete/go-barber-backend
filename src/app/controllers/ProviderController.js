import User from "../models/User";
import File from "../models/Files";

class ProviderController {
  async index(req, res) {
    const providers = await User.findAll({
      where: { provider: true },
      attributes: ["id", "name", "avatar_id"],
      include: [
        { model: File, as: "avatar", attributes: ["name", "path", "url"] }
      ]
    });
    res.json(providers);
  }
}

export default new ProviderController();
