/* eslint-disable no-console */
import * as Yup from "yup";
import { startOfHour, parseISO, isBefore, format, subHours } from "date-fns";
import pt from "date-fns/locale/pt";
import Appointment from "../models/Appointment";
import User from "../models/User";
import File from "../models/Files";
import Notification from "../schemas/Notification";
import Mail from "../../lib/Mail";

class AppointmentController {
  async index(req, res) {
    const { page = 1 } = req.query;
    const appointments = await Appointment.findAll({
      where: {
        user_id: req.userId,
        canceled_at: null
      },
      order: ["date"],
      limit: 20,
      offset: (page - 1) * 20,
      attributes: ["id", "date"],
      include: [
        {
          model: User,
          as: "provider",
          attributes: ["id", "name"],
          include: [
            { model: File, as: "avatar", attributes: ["id", "path", "url"] }
          ]
        }
      ]
    });
    return res.json(appointments);
  }

  async store(req, res) {
    const schema = Yup.object().shape({
      provider_id: Yup.number().required(),
      date: Yup.date().required()
    });
    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: "Validation Fails" });
    }
    const { provider_id, date } = req.body;
    /**
     * check if provider id is a a provider
     */
    const isProvider = await User.findOne({
      where: { id: provider_id, provider: true }
    });
    if (!isProvider) {
      res
        .status(401)
        .json({ error: "You canonly create appointmens with providers" });
    }
    // verifica se a data é do passado
    const hourStart = startOfHour(parseISO(date));
    if (isBefore(hourStart, new Date())) {
      return res.status(400).json({ error: "Past date are not permitted" });
    }
    // verifica se a data está disponivel
    const checkAvailablity = await Appointment.findOne({
      where: {
        provider_id,
        canceled_at: null,
        date: hourStart
      }
    });
    if (checkAvailablity) {
      return res
        .status(400)
        .json({ error: "Appointment date are not available" });
    }
    const appointment = await Appointment.create({
      user_id: req.userId,
      provider_id,
      date
    });
    /**
     * Notify provider
     *  */
    const formattedDate = format(
      hourStart,
      "'dia' dd 'de' MMM', ás' H:mm'h' ",
      { locale: pt }
    );
    const user = await User.findByPk(req.userId);

    await Notification.create({
      content: `Novo agendamento de ${user.name} para ${formattedDate}`,
      user: provider_id
    });
    return res.json(appointment);
  }

  async delete(req, res) {
    console.log("aqui 0");
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: "provider",
          attributes: ["name", "email"]
        },
        {
          model: User,
          as: "user",
          attributes: ["name"]
        }
      ]
    });
    console.log("aqui 1");
    if (appointment.user_id !== req.userId) {
      return res.status(401).json({
        error: "You dont have premition to cancel this appoiuntment "
      });
    }
    console.log("aqui 2");
    const dateWithSub = subHours(appointment.date, 2);
    if (isBefore(dateWithSub, new Date())) {
      res.status(401).json({
        error: "you can only cancel appointments 2 hours in advance."
      });
    }
    console.log("aqui 3");
    appointment.canceled_at = new Date();
    await appointment.save();
    await Mail.sendMail({
      to: `${appointment.provider.name} <${appointment.provider.email}>`,
      subject: "Agendamento Cancelado",
      template: "cancellation",
      context: {
        provider: appointment.provider.name,
        user: appointment.user.name,
        date: format(appointment.date, "'dia' dd 'de' MMM', ás' H:mm'h' ", {
          locale: pt
        })
      }
    });
    return res.json(appointment);
  }
}

export default new AppointmentController();
