//fetch

const fetch = require('node-fetch');
const cheerio = require('cheerio');

function getElementText(ch) {
    return ch.find("br").replaceWith("\n").end().text().trim();
}


function parseChannelInfo(html) {
  const $ = cheerio.load(html);
  
  const channelInfo = {};

  channelInfo.title = $('.tgme_channel_info_header_title').text();
  channelInfo.username = $('.tgme_channel_info_header_username').text();
  channelInfo.subscribers = $('.tgme_channel_info_counter').first().text();
  channelInfo.description = getElementText($('.tgme_channel_info_description'));

  // To get all the counter information, we will use a loop
  channelInfo.counters = {};
  $('.tgme_channel_info_counters .tgme_channel_info_counter').each((i, elem) => {
    let counterType = $(elem).find('.counter_type').text().trim();
    let counterValue = $(elem).find('.counter_value').text().trim();
    channelInfo.counters[counterType] = counterValue;
  });

  // Collect all messages
  channelInfo.messages = [];
  $('.tgme_widget_message_wrap').each((i, elem) => {
    const message = {};

    message.id = $(elem).find('.tgme_widget_message').data('post');
    //message.postView = $(elem).find('.tgme_widget_message').data('view');
    message.author = $(elem).find('.tgme_widget_message_author a').text().trim();
    message.text = getElementText($(elem).find('.tgme_widget_message_text.js-message_text'));
    message.views = $(elem).find('.tgme_widget_message_views').text().trim();
    message.date = $(elem).find('.tgme_widget_message_date time').attr('datetime');


    //Is reply (has tgme_widget_message_reply)
    const replyMessage = $(elem).find('.tgme_widget_message_reply');
    if (replyMessage.length) {
        const reply = {};
        reply.text = getElementText(replyMessage.find('.tgme_widget_message_metatext.js-message_reply_text'));
        reply.link = replyMessage.attr('href');
        message.reply = reply;
    }
    // Images
    const photoUrl = $(elem).find('.tgme_widget_message_photo_wrap').css('background-image');
    if (photoUrl) { 
      // Extract URL from the `url('...')` format
      message.photo = {
        url: photoUrl ? photoUrl.replace(/(^url\()|(\)$|[\"\'])/g, '') : null,
      };
    }

    // Videos
    const videoPlayerElem = $(elem).find('.tgme_widget_message_video_player');
    if (videoPlayerElem.length) {
      const thumbUrl = videoPlayerElem.find('.tgme_widget_message_video_thumb').css('background-image');
      const videoUrl = videoPlayerElem.find('video').attr('src');
      const videoDuration = videoPlayerElem.find('.message_video_duration').text().trim();
      
      // Extract URL from the `url('...')` format for thumbnail
      message.video = {
        url: videoUrl ? videoUrl : null,
        thumbnail: thumbUrl ? thumbUrl.replace(/(^url\()|(\)$|[\"\'])/g, '') : null,
        duration: videoDuration
      }
    }

    const audioElem = $(elem).find('.tgme_widget_message_document_wrap.audio');
    if (audioElem.length) {
        const title = getElementText(audioElem.find('.tgme_widget_message_document_title'));
        const extra = getElementText(audioElem.find('.tgme_widget_message_document_extra'));
        message.audio = {
            title: title,
            extra: extra
        }
    }

    channelInfo.messages.push(message);
  });

  return channelInfo;
}




async function getTelegramChannel(name) {
    const response = await fetch(`https://t.me/s/${name}`);
    const string = await response.text();
    return parseChannelInfo(string)
}

async function main() {
    const channel = await getTelegramChannel('ru4chan');
    console.log(JSON.stringify(channel, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});